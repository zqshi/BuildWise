import { useEffect, useMemo, useState } from "react";
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
  BUILTIN_ROLE_MATRIX_OPTIONS,
  canAccessGovernanceEntries,
  isBuiltinLockedRole,
  isValidMainlandPhone,
  resolvePermissionTabPanels,
  mapMemberPresetRoleToPlatformRole,
  toPermissionMemberRows,
  type MemberPresetRole,
  type PlatformRole,
  type PermissionTab
} from "./permissionSettingsModel";

type PermissionSettingsPageProps = {
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
};

type RoleMatrixKey = string;
type RoleRow = {
  key: string;
  label: string;
  description: string;
  level: number;
  permissionCount: number;
  updatedAt: string;
};

const platformRoleOptions: Array<{ value: PlatformRole; label: string }> = [
  { value: "admin", label: "超级管理员" },
  { value: "member", label: "成员" },
  { value: "viewer", label: "只读成员" }
];

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

const BUILTIN_ROLE_META: Record<string, { description: string; level: number }> = {
  owner: { description: "平台最高权限，默认拥有全量资源访问与治理能力", level: 9 },
  member: { description: "平台默认成员角色，拥有基础工作台访问能力", level: 1 }
};

type CustomRole = {
  id: number;
  key: string;
  label: string;
  description: string;
  level: number;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
};

function avatarTextOf(userId: string): string {
  return userId.slice(-2).toUpperCase();
}

function maskUserId(userId: string): string {
  if (/^\d{11}$/.test(userId)) {
    return `${userId.slice(0, 3)}****${userId.slice(-4)}`;
  }
  return userId;
}

function AddUserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.8 17a4.2 4.2 0 0 1 8.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16.5 8.2v5.6M13.7 11h5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function listAllPermissionPoints(permissionPoints: GovernancePermissionPoint[], governanceRoles: GovernanceRole[], customRoles: CustomRole[]) {
  if (permissionPoints.length > 0) {
    return permissionPoints.map((item) => item.key).sort((a, b) => a.localeCompare(b));
  }
  const set = new Set<string>();
  governanceRoles.forEach((role) => role.permissions.forEach((permission) => set.add(permission)));
  customRoles.forEach((role) => role.permissions.forEach((permission) => set.add(permission)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function PermissionSettingsPage({ currentRole }: PermissionSettingsPageProps) {
  const isAdmin = canAccessGovernanceEntries(currentRole);
  const [activeTab, setActiveTab] = useState<PermissionTab>("members");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [governanceRoles, setGovernanceRoles] = useState<GovernanceRole[]>([]);
  const [permissionPoints, setPermissionPoints] = useState<GovernancePermissionPoint[]>([]);
  const [bindings, setBindings] = useState<PlatformRoleBindingPayload[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showAddMemberDrawer, setShowAddMemberDrawer] = useState(false);
  const [showAddRoleDrawer, setShowAddRoleDrawer] = useState(false);
  const [memberForm, setMemberForm] = useState({
    name: "",
    phone: "",
    department: "",
    rolePreset: "member" as MemberPresetRole,
    validFrom: "",
    validTo: "",
    note: ""
  });
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    cloneFrom: "",
    level: 1,
    selectedPermissions: [] as string[]
  });
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [editingUserId, setEditingUserId] = useState("");
  const [editingRole, setEditingRole] = useState<PlatformRole>("member");
  const [selectedMatrixRole, setSelectedMatrixRole] = useState<RoleMatrixKey>("owner");
  const [showRoleConfigDrawer, setShowRoleConfigDrawer] = useState(false);
  const [rolePermissionDraft, setRolePermissionDraft] = useState<string[]>([]);

  const loadPageData = async () => {
    const [governance, points, roleBindings, customRoleItems] = await Promise.all([
      fetchGovernance(),
      fetchGovernancePermissionPoints(),
      fetchPlatformRoleBindings(),
      fetchGovernanceCustomRoles()
    ]);
    setGovernanceRoles(governance.roles);
    setPermissionPoints(points);
    setBindings(roleBindings);
    setCustomRoles(
      customRoleItems.map((item) => ({
        id: item.id,
        key: item.roleKey,
        label: item.name,
        description: item.description,
        level: item.level,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        permissions: item.permissions
      }))
    );
  };

  useEffect(() => {
    void loadPageData().catch((error) => {
      setNotice(error instanceof Error ? error.message : "权限数据加载失败");
    });
  }, []);

  const rows = useMemo(() => {
    const allRows = toPermissionMemberRows(bindings);
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return allRows;
    }
    return allRows.filter((item) => {
      const searchable = `${item.userId} ${item.roleLabel} ${item.teamName}`.toLowerCase();
      return searchable.includes(keyword);
    });
  }, [bindings, searchKeyword]);

  const roleOptions = useMemo(
    () => [...BUILTIN_ROLE_MATRIX_OPTIONS, ...customRoles.map((item) => ({ key: item.key, label: item.label }))],
    [customRoles]
  );

  const selectedCustomRole = useMemo(() => customRoles.find((item) => item.key === selectedMatrixRole) || null, [customRoles, selectedMatrixRole]);
  const permissionMapByRole = useMemo(() => {
    const map = new Map<string, string[]>();
    governanceRoles.forEach((item) => map.set(item.id, item.permissions));
    customRoles.forEach((item) => map.set(item.key, item.permissions));
    return map;
  }, [governanceRoles, customRoles]);
  const allPermissionPoints = useMemo(
    () => listAllPermissionPoints(permissionPoints, governanceRoles, customRoles),
    [permissionPoints, governanceRoles, customRoles]
  );
  const permissionPointTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    permissionPoints.forEach((item) => map.set(item.key, item.title));
    return map;
  }, [permissionPoints]);

  const rolePermissionMap = useMemo(() => {
    const map = new Map<string, string[]>();
    governanceRoles.forEach((item) => map.set(item.id, item.permissions));
    customRoles.forEach((item) => map.set(item.key, item.permissions));
    map.set("owner", allPermissionPoints);
    map.set("member", permissionMapByRole.get("pm") || []);
    return map;
  }, [governanceRoles, customRoles, allPermissionPoints, permissionMapByRole]);
  const groupedPermissionPoints = useMemo(() => {
    const grouped = new Map<string, Array<{ key: string; title: string }>>();
    permissionPoints.forEach((point) => {
      const module = point.module || "other";
      const list = grouped.get(module) || [];
      list.push({ key: point.key, title: point.title });
      grouped.set(module, list);
    });
    return Array.from(grouped.entries()).map(([module, points]) => ({
      key: module,
      title: MODULE_LABELS[module] || module,
      items: points.sort((a, b) => a.title.localeCompare(b.title))
    }));
  }, [permissionPoints]);
  const roleRows = useMemo<RoleRow[]>(() => {
    const builtinRows = BUILTIN_ROLE_MATRIX_OPTIONS.map((item) => {
      const permissions = rolePermissionMap.get(item.key) || [];
      return {
        key: item.key,
        label: item.label,
        description: BUILTIN_ROLE_META[item.key]?.description || "系统内置角色",
        level: BUILTIN_ROLE_META[item.key]?.level || 1,
        permissionCount: permissions.length,
        updatedAt: "--"
      };
    });
    const customRows = customRoles.map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description || "自定义角色",
      level: item.level,
      permissionCount: item.permissions.length,
      updatedAt: item.updatedAt.slice(0, 10)
    }));
    return [...builtinRows, ...customRows];
  }, [customRoles, rolePermissionMap]);

  const handleCreateBinding = async () => {
    if (!isAdmin || !memberForm.name.trim() || !isValidMainlandPhone(memberForm.phone)) {
      return;
    }
    try {
      setBusy(true);
      setNotice("");
      await upsertPlatformRoleBinding(
        { userId: memberForm.phone.trim(), role: mapMemberPresetRoleToPlatformRole(memberForm.rolePreset) },
        currentRole
      );
      await loadPageData();
      setMemberForm({
        name: "",
        phone: "",
        department: "",
        rolePreset: "member",
        validFrom: "",
        validTo: "",
        note: ""
      });
      setShowAddMemberDrawer(false);
      setNotice("成员权限已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "成员保存失败");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRole = async () => {
    if (!isAdmin || !roleForm.name.trim()) {
      return;
    }
    const selectedPermissions = roleForm.selectedPermissions;
    const clonedPermissions =
      roleForm.cloneFrom.trim() && permissionMapByRole.has(roleForm.cloneFrom.trim())
        ? permissionMapByRole.get(roleForm.cloneFrom.trim()) || []
        : [];
    const permissions = clonedPermissions.length > 0 ? clonedPermissions : selectedPermissions.length > 0 ? selectedPermissions : ["workspace:read"];
    try {
      setBusy(true);
      setNotice("");
      const created = await upsertGovernanceCustomRole(
        {
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
          level: roleForm.level,
          permissions
        },
        currentRole
      );
      const nextRole: CustomRole = {
        id: created.id,
        key: created.roleKey,
        label: created.name,
        description: created.description,
        level: created.level,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        permissions: created.permissions
      };
      setCustomRoles((prev) => [nextRole, ...prev.filter((item) => item.key !== nextRole.key)]);
      setSelectedMatrixRole(nextRole.key);
      setRoleForm({
        name: "",
        description: "",
        cloneFrom: "",
        level: 1,
        selectedPermissions: []
      });
      setShowAddRoleDrawer(false);
      setNotice("角色已新增");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "角色新增失败");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveBinding = async (userId: string) => {
    if (!isAdmin) {
      return;
    }
    try {
      setBusy(true);
      setNotice("");
      await removePlatformRoleBinding(userId, currentRole);
      await loadPageData();
      setNotice("成员已移除");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "成员移除失败");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateBinding = async (userId: string) => {
    if (!isAdmin) {
      return;
    }
    try {
      setBusy(true);
      setNotice("");
      await upsertPlatformRoleBinding({ userId, role: editingRole }, currentRole);
      await loadPageData();
      setEditingUserId("");
      setNotice("成员角色已更新");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "角色更新失败");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenRoleConfig = (roleKey: string) => {
    if (isBuiltinLockedRole(roleKey)) {
      return;
    }
    setSelectedMatrixRole(roleKey);
    setRolePermissionDraft([...(rolePermissionMap.get(roleKey) || [])]);
    setShowRoleConfigDrawer(true);
  };

  const handleSaveRolePermissions = async () => {
    if (!isAdmin || !selectedCustomRole) {
      setNotice("系统内置角色暂不支持修改");
      return;
    }
    try {
      setBusy(true);
      setNotice("");
      const allowed = new Set(allPermissionPoints);
      const permissions = [...new Set(rolePermissionDraft.filter((item) => allowed.has(item)))];
      const updated = await upsertGovernanceCustomRole(
        {
          roleKey: selectedCustomRole.key,
          name: selectedCustomRole.label,
          description: selectedCustomRole.description,
          level: selectedCustomRole.level,
          permissions
        },
        currentRole
      );
      setCustomRoles((prev) =>
        prev.map((item) =>
          item.key === updated.roleKey
            ? {
                ...item,
                label: updated.name,
                description: updated.description,
                level: updated.level,
                permissions: updated.permissions,
                updatedAt: updated.updatedAt
              }
            : item
        )
      );
      setNotice("角色权限已保存");
      setShowRoleConfigDrawer(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "角色权限保存失败");
    } finally {
      setBusy(false);
    }
  };

  const roleTitle = roleOptions.find((item) => item.key === selectedMatrixRole)?.label || "角色";
  const { showMembersPanel, showRolePanel } = resolvePermissionTabPanels(activeTab);

  return (
    <section className="permissions-page">
      <section className="panel permissions-main">
        <div className="permissions-tabs">
          <button
            type="button"
            className={`permissions-tab ${activeTab === "members" ? "active" : ""}`}
            onClick={() => setActiveTab("members")}
          >
            成员管理
          </button>
          <button
            type="button"
            className={`permissions-tab ${activeTab === "roles" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("roles");
              setSelectedMatrixRole("owner");
            }}
          >
            角色权限
          </button>
        </div>

        {showMembersPanel ? (
          <section className="permissions-members-section">
            <div className="permissions-toolbar">
              <label className="permissions-search-field" aria-label="搜索成员、团队或角色">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  placeholder="搜索成员、团队或角色"
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn primary permissions-add-btn"
                onClick={() => setShowAddMemberDrawer(true)}
                disabled={!isAdmin}
                title={!isAdmin ? "仅系统负责人可新增成员" : undefined}
              >
                <AddUserIcon />
                <span>添加成员</span>
              </button>
            </div>
            <section className="permissions-table-shell">
              <div className="permissions-table-head">
                <span>用户名</span>
                <span>角色</span>
                <span>所属团队</span>
                <span>加入时间</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              <ul className="permissions-table-body">
                {rows.length === 0 ? (
                  <li className="permissions-row empty">暂无成员数据</li>
                ) : rows.map((row) => (
                  <li key={row.userId} className="permissions-row">
                    <span className="user-cell">
                      <span className="user-avatar">{avatarTextOf(row.userId)}</span>
                      <span className="user-meta">
                        <strong>{row.displayName}</strong>
                        <em>{maskUserId(row.userId)}</em>
                      </span>
                    </span>
                    <span>
                      {editingUserId === row.userId ? (
                        <select value={editingRole} onChange={(event) => setEditingRole(event.target.value as PlatformRole)}>
                          {platformRoleOptions.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      ) : row.roleLabel}
                    </span>
                    <span>{row.teamName}</span>
                    <span>{row.joinedAt}</span>
                    <span className={`permissions-status-badge ${row.statusTone === "muted" ? "muted" : "ok"}`}>
                      <i className="status-dot" />
                      {row.statusLabel}
                    </span>
                    <span className="action-cell">
                      {editingUserId === row.userId ? (
                        <>
                          <button type="button" className="link-btn" onClick={() => void handleUpdateBinding(row.userId)} disabled={!isAdmin || busy}>
                            保存
                          </button>
                          <button type="button" className="link-btn muted" onClick={() => setEditingUserId("")}>
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setEditingUserId(row.userId);
                              setEditingRole(row.role);
                            }}
                            disabled={!isAdmin}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="link-btn muted"
                            onClick={() => void handleRemoveBinding(row.userId)}
                            disabled={!isAdmin || busy}
                          >
                            移除
                          </button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="permissions-table-foot">
                <span>共 {rows.length} 名成员</span>
                <div className="permissions-pager" aria-hidden="true">
                  <span className="pager-btn">‹</span>
                  <span className="pager-btn">›</span>
                </div>
              </div>
            </section>
          </section>
        ) : null}

        {showRolePanel ? (
          <section className="permissions-role-section">
            <div className="permissions-toolbar">
              <span className="permissions-role-hint">角色列表</span>
              <button
                type="button"
                className="btn primary permissions-add-role-btn upcoming"
                onClick={(event) => event.preventDefault()}
                aria-disabled="true"
                title="即将上线"
              >
                新增角色
              </button>
            </div>
            <section className="permissions-table-shell">
              <div className="permissions-role-table-head">
                <span>角色名称</span>
                <span>角色描述</span>
                <span>等级</span>
                <span>权限点</span>
                <span>更新时间</span>
                <span>操作</span>
              </div>
              <ul className="permissions-table-body">
                {roleRows.map((item) => (
                  <li
                    key={item.key}
                    className={`permissions-role-row ${selectedMatrixRole === item.key ? "active" : ""} ${isBuiltinLockedRole(item.key) ? "locked" : ""}`}
                  >
                    <span>{item.label}</span>
                    <span className="role-desc">{item.description}</span>
                    <span>{item.level}</span>
                    <span>{item.permissionCount}</span>
                    <span>{item.updatedAt}</span>
                    <span className="action-cell">
                      {isBuiltinLockedRole(item.key) ? (
                        <button type="button" className="link-btn muted" disabled title="系统内置角色暂不支持操作">
                          不支持操作
                        </button>
                      ) : (
                        <button type="button" className="link-btn" onClick={() => handleOpenRoleConfig(item.key)}>
                          配置权限
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        ) : null}
        {notice ? <p className="permissions-notice">{notice}</p> : null}
      </section>

      <div className={`permissions-drawer-mask ${showAddMemberDrawer ? "open" : ""}`} onClick={() => setShowAddMemberDrawer(false)} />
      <aside className={`permissions-form-drawer ${showAddMemberDrawer ? "open" : ""}`} aria-hidden={!showAddMemberDrawer}>
        <header className="permissions-form-head">
          <h3>添加新成员</h3>
          <button type="button" className="permissions-close-btn" onClick={() => setShowAddMemberDrawer(false)}><CloseIcon /></button>
        </header>
        <div className="permissions-form-body">
          <label>
            <span>成员姓名 *</span>
            <input value={memberForm.name} onChange={(e) => setMemberForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="请输入真实姓名" />
          </label>
          <label>
            <span>手机号 *</span>
            <input value={memberForm.phone} onChange={(e) => setMemberForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="请输入11位手机号" />
            <small>被添加手机号可使用“手机号+验证码”登录平台</small>
          </label>
          <label>
            <span>所属部门</span>
            <input value={memberForm.department} onChange={(e) => setMemberForm((prev) => ({ ...prev, department: e.target.value }))} placeholder="请输入部门" />
          </label>
          <fieldset className="permissions-radio-group">
            <legend>分配角色 *</legend>
            <label>
              <input
                type="radio"
                checked={memberForm.rolePreset === "super_admin"}
                onChange={() => setMemberForm((prev) => ({ ...prev, rolePreset: "super_admin" }))}
              />
              <span>超级管理员</span>
            </label>
            <label>
              <input
                type="radio"
                checked={memberForm.rolePreset === "member"}
                onChange={() => setMemberForm((prev) => ({ ...prev, rolePreset: "member" }))}
              />
              <span>成员</span>
            </label>
          </fieldset>
          <div className="permissions-form-row-two">
            <label>
              <span>生效时间</span>
              <input type="date" value={memberForm.validFrom} onChange={(e) => setMemberForm((prev) => ({ ...prev, validFrom: e.target.value }))} />
            </label>
            <label>
              <span>失效时间</span>
              <input type="date" value={memberForm.validTo} onChange={(e) => setMemberForm((prev) => ({ ...prev, validTo: e.target.value }))} />
            </label>
          </div>
          <label>
            <span>备注</span>
            <textarea
              value={memberForm.note}
              onChange={(e) => setMemberForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="添加额外说明"
              rows={3}
            />
          </label>
        </div>
        <footer className="permissions-form-foot">
          <button type="button" className="btn ghost" onClick={() => setShowAddMemberDrawer(false)}>取消</button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void handleCreateBinding()}
            disabled={!isAdmin || busy || !memberForm.name.trim() || !isValidMainlandPhone(memberForm.phone)}
          >
            确认添加
          </button>
        </footer>
      </aside>

      <div className={`permissions-drawer-mask ${showAddRoleDrawer ? "open" : ""}`} onClick={() => setShowAddRoleDrawer(false)} />
      <aside className={`permissions-form-drawer ${showAddRoleDrawer ? "open" : ""}`} aria-hidden={!showAddRoleDrawer}>
        <header className="permissions-form-head">
          <h3>添加新角色</h3>
          <button type="button" className="permissions-close-btn" onClick={() => setShowAddRoleDrawer(false)}><CloseIcon /></button>
        </header>
        <div className="permissions-form-body">
          <label>
            <span>角色名称</span>
            <input value={roleForm.name} onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="请输入角色名称" />
          </label>
          <label>
            <span>角色描述</span>
            <textarea value={roleForm.description} onChange={(e) => setRoleForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} />
          </label>
          <div className="permissions-form-row-two">
            <label>
              <span>复制权限自</span>
              <select
                value={roleForm.cloneFrom}
                onChange={(e) => {
                  const cloneFrom = e.target.value;
                  const cloned = cloneFrom && permissionMapByRole.has(cloneFrom) ? permissionMapByRole.get(cloneFrom) || [] : [];
                  setRoleForm((prev) => ({ ...prev, cloneFrom, selectedPermissions: [...cloned] }));
                }}
              >
                <option value="">不复制</option>
                {roleOptions.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>角色等级</span>
              <input
                type="number"
                min={1}
                max={9}
                value={roleForm.level}
                onChange={(e) => setRoleForm((prev) => ({ ...prev, level: Number(e.target.value) || 1 }))}
              />
            </label>
          </div>
          <fieldset className="permissions-checkbox-group">
            <legend>权限点配置</legend>
            {allPermissionPoints.map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={roleForm.selectedPermissions.includes(permission)}
                  onChange={(e) => {
                    setRoleForm((prev) => ({
                      ...prev,
                      selectedPermissions: e.target.checked
                        ? [...prev.selectedPermissions, permission]
                        : prev.selectedPermissions.filter((item) => item !== permission)
                    }));
                  }}
                />
                <span>{permissionPointTitleMap.get(permission) || permission}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <footer className="permissions-form-foot">
          <button type="button" className="btn ghost" onClick={() => setShowAddRoleDrawer(false)}>取消</button>
          <button type="button" className="btn primary" onClick={() => void handleCreateRole()} disabled={!isAdmin || busy || !roleForm.name.trim()}>
            创建角色
          </button>
        </footer>
      </aside>

      <div className={`permissions-drawer-mask ${showRoleConfigDrawer ? "open" : ""}`} onClick={() => setShowRoleConfigDrawer(false)} />
      <aside className={`permissions-form-drawer wide ${showRoleConfigDrawer ? "open" : ""}`} aria-hidden={!showRoleConfigDrawer}>
        <header className="permissions-form-head">
          <h3>{roleTitle} 权限配置</h3>
          <button type="button" className="permissions-close-btn" onClick={() => setShowRoleConfigDrawer(false)}><CloseIcon /></button>
        </header>
        <div className="permissions-form-body">
          {groupedPermissionPoints.map((group) => (
            <fieldset key={group.key} className="permissions-checkbox-group">
              <legend>{group.title}</legend>
              {group.items.map((item) => (
                <label key={item.key}>
                  <input
                    type="checkbox"
                    checked={rolePermissionDraft.includes(item.key)}
                    disabled={!selectedCustomRole}
                    onChange={(event) =>
                      setRolePermissionDraft((prev) =>
                        event.target.checked ? [...prev, item.key] : prev.filter((x) => x !== item.key)
                      )
                    }
                  />
                  <span>{item.title}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <footer className="permissions-form-foot">
          <button type="button" className="btn ghost" onClick={() => setShowRoleConfigDrawer(false)}>取消</button>
          <button type="button" className="btn primary" onClick={() => void handleSaveRolePermissions()} disabled={!isAdmin || busy || !selectedCustomRole}>
            保存权限
          </button>
        </footer>
      </aside>
    </section>
  );
}
