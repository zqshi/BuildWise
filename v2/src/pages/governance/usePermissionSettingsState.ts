import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGovernanceCustomRoles,
  fetchGovernancePermissionPoints,
  fetchGovernance,
  fetchPlatformRoleBindings,
  removePlatformRoleBinding,
  upsertPlatformRoleBinding,
  upsertGovernanceCustomRole,
  type PlatformRoleBindingPayload
} from "../../app/workspaceApi";
import type { GovernancePermissionPoint, GovernanceRole } from "../../domain/workspace/governanceTypes";
import {
  buildMemberBindingRoleOptions,
  BUILTIN_ROLE_MATRIX_OPTIONS,
  canAccessGovernanceEntries,
  isBuiltinLockedRole,
  isValidMainlandPhone,
  resolvePermissionTabPanels,
  toPermissionMemberRows,
  type PlatformRole,
  type PermissionTab
} from "./permissionSettingsModel";

/* ================================================================
   Shared types
   ================================================================ */

export type CustomRole = {
  id: number;
  key: string;
  label: string;
  description: string;
  level: number;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
};

export type RoleRow = {
  key: string;
  label: string;
  description: string;
  level: number;
  permissionCount: number;
  updatedAt: string;
};

export type MemberForm = {
  name: string;
  phone: string;
  department: string;
  roleKey: string;
  validFrom: string;
  validTo: string;
  note: string;
};

export type RoleForm = {
  name: string;
  description: string;
  cloneFrom: string;
  level: number;
  selectedPermissions: string[];
};

/* ================================================================
   Constants
   ================================================================ */

const BUILTIN_ROLE_META: Record<string, { description: string; level: number }> = {
  owner: { description: "平台最高权限，默认拥有全量资源访问与治理能力", level: 9 },
  member: { description: "平台默认成员角色，拥有基础工作台访问能力", level: 1 }
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: "仪表盘",
  workspace: "项目管理",
  iteration: "迭代执行",
  model: "模型设计",
  trace: "追溯分析",
  assessment: "质量评估",
  collab: "协作共享",
  template: "模板执行",
  deploy: "部署运维",
  policy: "策略门禁",
  governance: "权限治理",
  other: "其他权限"
};

const INITIAL_MEMBER_FORM: MemberForm = {
  name: "",
  phone: "",
  department: "",
  roleKey: "pm",
  validFrom: "",
  validTo: "",
  note: ""
};

const INITIAL_ROLE_FORM: RoleForm = {
  name: "",
  description: "",
  cloneFrom: "",
  level: 1,
  selectedPermissions: []
};

/* ================================================================
   Pure helpers (each well under 60 lines)
   ================================================================ */

function toCustomRole(item: {
  id: number; roleKey: string; name: string; description: string;
  level: number; createdAt: string; updatedAt: string; permissions: string[];
}): CustomRole {
  return {
    id: item.id, key: item.roleKey, label: item.name,
    description: item.description, level: item.level,
    createdAt: item.createdAt, updatedAt: item.updatedAt, permissions: item.permissions
  };
}

function listAllPermissionPoints(
  points: GovernancePermissionPoint[], roles: GovernanceRole[], custom: CustomRole[]
) {
  if (points.length > 0) return points.map((p) => p.key).sort((a, b) => a.localeCompare(b));
  const set = new Set<string>();
  roles.forEach((r) => r.permissions.forEach((p) => set.add(p)));
  custom.forEach((r) => r.permissions.forEach((p) => set.add(p)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function buildFilteredRows(
  bindings: PlatformRoleBindingPayload[], govRoles: GovernanceRole[],
  customRoles: CustomRole[], keyword: string
) {
  const all = toPermissionMemberRows(
    bindings, govRoles,
    customRoles.map((c) => ({ key: c.key, label: c.label, permissions: c.permissions }))
  );
  const kw = keyword.trim().toLowerCase();
  if (!kw) return all;
  return all.filter((r) => `${r.userId} ${r.roleLabel} ${r.teamName}`.toLowerCase().includes(kw));
}

function buildPermissionMapByRole(govRoles: GovernanceRole[], customRoles: CustomRole[]) {
  const map = new Map<string, string[]>();
  govRoles.forEach((r) => map.set(r.id, r.permissions));
  customRoles.forEach((r) => map.set(r.key, r.permissions));
  return map;
}

function buildRolePermissionMap(
  govRoles: GovernanceRole[], customRoles: CustomRole[],
  allPoints: string[], base: Map<string, string[]>
) {
  const map = new Map<string, string[]>();
  govRoles.forEach((r) => map.set(r.id, r.permissions));
  customRoles.forEach((r) => map.set(r.key, r.permissions));
  map.set("owner", allPoints);
  map.set("member", base.get("pm") || []);
  return map;
}

function buildGroupedPoints(points: GovernancePermissionPoint[]) {
  const grouped = new Map<string, Array<{ key: string; title: string }>>();
  points.forEach((p) => {
    const mod = p.module || "other";
    const list = grouped.get(mod) || [];
    list.push({ key: p.key, title: p.title });
    grouped.set(mod, list);
  });
  return Array.from(grouped.entries()).map(([mod, pts]) => ({
    key: mod, title: MODULE_LABELS[mod] || mod,
    items: pts.sort((a, b) => a.title.localeCompare(b.title))
  }));
}

function buildRoleRows(customRoles: CustomRole[], rpMap: Map<string, string[]>): RoleRow[] {
  const builtin = BUILTIN_ROLE_MATRIX_OPTIONS.map((o) => ({
    key: o.key, label: o.label,
    description: BUILTIN_ROLE_META[o.key]?.description || "系统内置角色",
    level: BUILTIN_ROLE_META[o.key]?.level || 1,
    permissionCount: (rpMap.get(o.key) || []).length,
    updatedAt: "--"
  }));
  const custom = customRoles.map((c) => ({
    key: c.key, label: c.label,
    description: c.description || "自定义角色",
    level: c.level, permissionCount: c.permissions.length,
    updatedAt: c.updatedAt.slice(0, 10)
  }));
  return [...builtin, ...custom];
}

/* ================================================================
   Sub-hooks (each < 60 lines)
   ================================================================ */

/** Raw data loading: governance roles, permission points, bindings, custom roles */
function usePermissionData() {
  const [governanceRoles, setGovernanceRoles] = useState<GovernanceRole[]>([]);
  const [permissionPoints, setPermissionPoints] = useState<GovernancePermissionPoint[]>([]);
  const [bindings, setBindings] = useState<PlatformRoleBindingPayload[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [notice, setNotice] = useState("");

  const loadPageData = useCallback(async () => {
    const [gov, pts, rb, cr] = await Promise.all([
      fetchGovernance(), fetchGovernancePermissionPoints(),
      fetchPlatformRoleBindings(), fetchGovernanceCustomRoles()
    ]);
    setGovernanceRoles(gov.roles);
    setPermissionPoints(pts);
    setBindings(rb);
    setCustomRoles(cr.map(toCustomRole));
  }, []);

  useEffect(() => {
    void loadPageData().catch((e) => {
      setNotice(e instanceof Error ? e.message : "权限数据加载失败");
    });
  }, [loadPageData]);

  return {
    governanceRoles, permissionPoints, bindings, customRoles, setCustomRoles,
    notice, setNotice, loadPageData
  };
}

/** Derived / memoised values computed from raw data */
function usePermissionMemos(
  bindings: PlatformRoleBindingPayload[],
  governanceRoles: GovernanceRole[],
  permissionPoints: GovernancePermissionPoint[],
  customRoles: CustomRole[],
  searchKeyword: string,
  selectedMatrixRole: string
) {
  const rows = useMemo(
    () => buildFilteredRows(bindings, governanceRoles, customRoles, searchKeyword),
    [bindings, searchKeyword, governanceRoles, customRoles]
  );
  const roleOptions = useMemo(
    () => [...BUILTIN_ROLE_MATRIX_OPTIONS, ...customRoles.map((c) => ({ key: c.key, label: c.label }))],
    [customRoles]
  );
  const memberBindingRoleOptions = useMemo(
    () => buildMemberBindingRoleOptions(governanceRoles, customRoles.map((c) => ({ key: c.key, label: c.label, permissions: c.permissions }))),
    [governanceRoles, customRoles]
  );
  const selectedCustomRole = useMemo(
    () => customRoles.find((c) => c.key === selectedMatrixRole) || null,
    [customRoles, selectedMatrixRole]
  );
  const permissionMapByRole = useMemo(
    () => buildPermissionMapByRole(governanceRoles, customRoles),
    [governanceRoles, customRoles]
  );
  const allPermissionPoints = useMemo(
    () => listAllPermissionPoints(permissionPoints, governanceRoles, customRoles),
    [permissionPoints, governanceRoles, customRoles]
  );
  const permissionPointTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    permissionPoints.forEach((p) => m.set(p.key, p.title));
    return m;
  }, [permissionPoints]);
  const rolePermissionMap = useMemo(
    () => buildRolePermissionMap(governanceRoles, customRoles, allPermissionPoints, permissionMapByRole),
    [governanceRoles, customRoles, allPermissionPoints, permissionMapByRole]
  );
  const groupedPermissionPoints = useMemo(() => buildGroupedPoints(permissionPoints), [permissionPoints]);
  const roleRows = useMemo(() => buildRoleRows(customRoles, rolePermissionMap), [customRoles, rolePermissionMap]);
  const roleTitle = roleOptions.find((o) => o.key === selectedMatrixRole)?.label || "角色";

  return {
    rows, roleOptions, memberBindingRoleOptions, selectedCustomRole,
    permissionMapByRole, allPermissionPoints, permissionPointTitleMap,
    rolePermissionMap, groupedPermissionPoints, roleRows, roleTitle
  };
}

/** UI toggles: tabs, drawers, forms, editing state */
function usePermissionUI() {
  const [activeTab, setActiveTab] = useState<PermissionTab>("members");
  const [busy, setBusy] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showAddMemberDrawer, setShowAddMemberDrawer] = useState(false);
  const [showAddRoleDrawer, setShowAddRoleDrawer] = useState(false);
  const [memberForm, setMemberForm] = useState<MemberForm>({ ...INITIAL_MEMBER_FORM });
  const [roleForm, setRoleForm] = useState<RoleForm>({ ...INITIAL_ROLE_FORM });
  const [editingUserId, setEditingUserId] = useState("");
  const [editingRole, setEditingRole] = useState<PlatformRole>("pm");
  const [selectedMatrixRole, setSelectedMatrixRole] = useState<string>("owner");
  const [showRoleConfigDrawer, setShowRoleConfigDrawer] = useState(false);
  const [rolePermissionDraft, setRolePermissionDraft] = useState<string[]>([]);

  return {
    activeTab, setActiveTab, busy, setBusy,
    searchKeyword, setSearchKeyword,
    showAddMemberDrawer, setShowAddMemberDrawer,
    showAddRoleDrawer, setShowAddRoleDrawer,
    memberForm, setMemberForm, roleForm, setRoleForm,
    editingUserId, setEditingUserId, editingRole, setEditingRole,
    selectedMatrixRole, setSelectedMatrixRole,
    showRoleConfigDrawer, setShowRoleConfigDrawer,
    rolePermissionDraft, setRolePermissionDraft
  };
}

/* ================================================================
   Handler factories (each < 60 lines)
   ================================================================ */

type HandlerDeps = {
  isAdmin: boolean;
  currentRole: string;
  ui: ReturnType<typeof usePermissionUI>;
  data: ReturnType<typeof usePermissionData>;
  memos: ReturnType<typeof usePermissionMemos>;
};

function makeHandleCreateBinding(d: HandlerDeps) {
  return async () => {
    if (!d.isAdmin || !d.ui.memberForm.name.trim() || !isValidMainlandPhone(d.ui.memberForm.phone)) return;
    try {
      d.ui.setBusy(true); d.data.setNotice("");
      await upsertPlatformRoleBinding({ userId: d.ui.memberForm.phone.trim(), role: d.ui.memberForm.roleKey }, d.currentRole);
      await d.data.loadPageData();
      d.ui.setMemberForm({ ...INITIAL_MEMBER_FORM });
      d.ui.setShowAddMemberDrawer(false);
      d.data.setNotice("成员权限已保存");
    } catch (e) {
      d.data.setNotice(e instanceof Error ? e.message : "成员保存失败");
    } finally { d.ui.setBusy(false); }
  };
}

function makeHandleCreateRole(d: HandlerDeps) {
  return async () => {
    if (!d.isAdmin || !d.ui.roleForm.name.trim()) return;
    const cloned = d.ui.roleForm.cloneFrom.trim() && d.memos.permissionMapByRole.has(d.ui.roleForm.cloneFrom.trim())
      ? d.memos.permissionMapByRole.get(d.ui.roleForm.cloneFrom.trim()) || [] : [];
    const perms = cloned.length > 0 ? cloned
      : d.ui.roleForm.selectedPermissions.length > 0 ? d.ui.roleForm.selectedPermissions : ["workspace:read"];
    try {
      d.ui.setBusy(true); d.data.setNotice("");
      const created = await upsertGovernanceCustomRole(
        { name: d.ui.roleForm.name.trim(), description: d.ui.roleForm.description.trim(), level: d.ui.roleForm.level, permissions: perms },
        d.currentRole
      );
      const next = toCustomRole(created);
      d.data.setCustomRoles((prev) => [next, ...prev.filter((i) => i.key !== next.key)]);
      d.ui.setSelectedMatrixRole(next.key);
      d.ui.setRoleForm({ ...INITIAL_ROLE_FORM });
      d.ui.setShowAddRoleDrawer(false);
      d.data.setNotice("角色已新增");
    } catch (e) {
      d.data.setNotice(e instanceof Error ? e.message : "角色新增失败");
    } finally { d.ui.setBusy(false); }
  };
}

function makeHandleRemoveBinding(d: HandlerDeps) {
  return async (userId: string) => {
    if (!d.isAdmin) return;
    try {
      d.ui.setBusy(true); d.data.setNotice("");
      await removePlatformRoleBinding(userId, d.currentRole);
      await d.data.loadPageData();
      d.data.setNotice("成员已移除");
    } catch (e) {
      d.data.setNotice(e instanceof Error ? e.message : "成员移除失败");
    } finally { d.ui.setBusy(false); }
  };
}

function makeHandleUpdateBinding(d: HandlerDeps) {
  return async (userId: string) => {
    if (!d.isAdmin) return;
    try {
      d.ui.setBusy(true); d.data.setNotice("");
      await upsertPlatformRoleBinding({ userId, role: d.ui.editingRole }, d.currentRole);
      await d.data.loadPageData();
      d.ui.setEditingUserId("");
      d.data.setNotice("成员角色已更新");
    } catch (e) {
      d.data.setNotice(e instanceof Error ? e.message : "角色更新失败");
    } finally { d.ui.setBusy(false); }
  };
}

function makeHandleOpenRoleConfig(d: HandlerDeps) {
  return (roleKey: string) => {
    if (isBuiltinLockedRole(roleKey)) return;
    d.ui.setSelectedMatrixRole(roleKey);
    d.ui.setRolePermissionDraft([...(d.memos.rolePermissionMap.get(roleKey) || [])]);
    d.ui.setShowRoleConfigDrawer(true);
  };
}

function makeHandleSaveRolePermissions(d: HandlerDeps) {
  return async () => {
    if (!d.isAdmin || !d.memos.selectedCustomRole) {
      d.data.setNotice("系统内置角色暂不支持修改"); return;
    }
    try {
      d.ui.setBusy(true); d.data.setNotice("");
      const allowed = new Set(d.memos.allPermissionPoints);
      const perms = [...new Set(d.ui.rolePermissionDraft.filter((p) => allowed.has(p)))];
      const cr = d.memos.selectedCustomRole;
      const updated = await upsertGovernanceCustomRole(
        { roleKey: cr.key, name: cr.label, description: cr.description, level: cr.level, permissions: perms },
        d.currentRole
      );
      d.data.setCustomRoles((prev) =>
        prev.map((i) => i.key === updated.roleKey
          ? { ...i, label: updated.name, description: updated.description, level: updated.level, permissions: updated.permissions, updatedAt: updated.updatedAt }
          : i)
      );
      d.data.setNotice("角色权限已保存");
      d.ui.setShowRoleConfigDrawer(false);
    } catch (e) {
      d.data.setNotice(e instanceof Error ? e.message : "角色权限保存失败");
    } finally { d.ui.setBusy(false); }
  };
}

/* ================================================================
   Main composition hook (< 60 lines)
   ================================================================ */

export function usePermissionSettingsState(currentRole: "owner" | "pm" | "developer" | "qa" | "viewer") {
  const isAdmin = canAccessGovernanceEntries(currentRole);
  const data = usePermissionData();
  const ui = usePermissionUI();
  const memos = usePermissionMemos(
    data.bindings, data.governanceRoles, data.permissionPoints,
    data.customRoles, ui.searchKeyword, ui.selectedMatrixRole
  );
  const deps: HandlerDeps = { isAdmin, currentRole, ui, data, memos };
  const tabPanels = resolvePermissionTabPanels(ui.activeTab);

  return {
    isAdmin, notice: data.notice, tabPanels,
    activeTab: ui.activeTab, setActiveTab: ui.setActiveTab, busy: ui.busy,
    rows: memos.rows, searchKeyword: ui.searchKeyword, setSearchKeyword: ui.setSearchKeyword,
    editingUserId: ui.editingUserId, setEditingUserId: ui.setEditingUserId,
    editingRole: ui.editingRole, setEditingRole: ui.setEditingRole,
    memberBindingRoleOptions: memos.memberBindingRoleOptions,
    handleUpdateBinding: makeHandleUpdateBinding(deps),
    handleRemoveBinding: makeHandleRemoveBinding(deps),
    roleRows: memos.roleRows, selectedMatrixRole: ui.selectedMatrixRole,
    setSelectedMatrixRole: ui.setSelectedMatrixRole,
    handleOpenRoleConfig: makeHandleOpenRoleConfig(deps),
    showAddMemberDrawer: ui.showAddMemberDrawer, setShowAddMemberDrawer: ui.setShowAddMemberDrawer,
    memberForm: ui.memberForm, setMemberForm: ui.setMemberForm,
    handleCreateBinding: makeHandleCreateBinding(deps),
    showAddRoleDrawer: ui.showAddRoleDrawer, setShowAddRoleDrawer: ui.setShowAddRoleDrawer,
    roleForm: ui.roleForm, setRoleForm: ui.setRoleForm,
    handleCreateRole: makeHandleCreateRole(deps),
    roleOptions: memos.roleOptions, allPermissionPoints: memos.allPermissionPoints,
    permissionPointTitleMap: memos.permissionPointTitleMap, permissionMapByRole: memos.permissionMapByRole,
    showRoleConfigDrawer: ui.showRoleConfigDrawer, setShowRoleConfigDrawer: ui.setShowRoleConfigDrawer,
    roleTitle: memos.roleTitle, selectedCustomRole: memos.selectedCustomRole,
    rolePermissionDraft: ui.rolePermissionDraft, setRolePermissionDraft: ui.setRolePermissionDraft,
    groupedPermissionPoints: memos.groupedPermissionPoints,
    handleSaveRolePermissions: makeHandleSaveRolePermissions(deps)
  };
}
