import type { PlatformRoleBindingPayload } from "../../app/workspaceApi";
import type { GovernanceRole } from "../../domain/workspace/governanceTypes";

export type PlatformRole = PlatformRoleBindingPayload["role"];
export type GovernanceCustomRoleSummary = {
  key: string;
  label: string;
  permissions: string[];
};

export type PermissionMemberRow = {
  userId: string;
  displayName: string;
  role: PlatformRole;
  roleLabel: string;
  teamName: string;
  joinedAt: string;
  statusLabel: "正常" | "禁用";
  statusTone: "ok" | "muted";
};

export type PermissionGroup = {
  key: string;
  title: string;
  items: string[];
};

export type PermissionTab = "members" | "roles";
export type MemberPresetRole = "super_admin" | "member";
export type BuiltinRoleMatrixKey = "owner" | "member";

const ROLE_LABELS: Record<PlatformRole, string> = {
  admin: "超级管理员",
  member: "成员",
  viewer: "只读成员"
};

const GROUP_TITLES: Record<string, string> = {
  dashboard: "仪表盘",
  projects: "项目工作台",
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

const GROUP_ORDER = ["dashboard", "projects", "workspace", "iteration", "model", "trace", "assessment", "collab", "template", "deploy", "policy", "governance", "other"];
const DISPLAY_NAMES = ["张建国", "李晓梅", "王志强", "陈雅婷", "赵文博", "刘思雨", "周子航", "吴嘉宁"];

const PERMISSION_LABEL_MAP: Record<string, string[]> = {
  "dashboard:view": ["查看仪表盘"],
  "projects:view": ["查看项目工作台"],
  "permissions:view": ["查看权限管理页"],
  "workspace:*": ["创建与归档项目", "修改项目基本信息", "删除项目权限"],
  "workspace:read": ["查看项目与成员信息"],
  "workspace:write": ["编辑项目与迭代配置"],
  "iteration:transition": ["推进迭代流程状态"],
  "iteration:transition:complete": ["执行迭代完成态流转"],
  "model:*": ["编辑模型实体关系", "调整规则绑定配置", "发布模型版本快照"],
  "model:read": ["查看模型结构与规则"],
  "model:write": ["编辑模型结构与规则"],
  "governance:*": ["管理平台成员权限", "维护策略审计记录", "变更治理角色映射"],
  "trace:read": ["查看追溯分析报告"],
  "assessment:recompute": ["触发质量评估重算"],
  "collab:read": ["查看协作快照与共享"],
  "collab:write": ["创建快照与共享链接"],
  "template:run": ["执行平台模板"],
  "deploy:read": ["查看部署与运维指标"],
  "deploy:write": ["创建部署与运维动作"],
  "deploy:transition": ["推进部署状态"],
  "policy:read": ["查看策略与门禁"]
};

const BUILTIN_LOCKED_ROLE_KEYS: BuiltinRoleMatrixKey[] = ["owner", "member"];

export const BUILTIN_ROLE_MATRIX_OPTIONS: Array<{ key: BuiltinRoleMatrixKey; label: string }> = [
  { key: "owner", label: "超级管理员" },
  { key: "member", label: "成员" }
];

export function platformRoleLabel(role: PlatformRole): string {
  return ROLE_LABELS[role];
}

export function toWorkspaceRoleId(role: PlatformRole): GovernanceRole["id"] {
  if (role === "admin") return "owner";
  if (role === "member") return "pm";
  return "viewer";
}

function normalizeBindingRole(role: string): string {
  if (role === "admin") return "owner";
  if (role === "member") return "pm";
  return role;
}

function resolveMemberRoleLabel(
  role: string,
  governanceRoles: GovernanceRole[],
  customRoles: GovernanceCustomRoleSummary[]
) {
  const normalizedRole = normalizeBindingRole(role);
  const governanceRole = governanceRoles.find((item) => item.id === normalizedRole);
  if (governanceRole) {
    if (governanceRole.id === "owner") {
      return "超级管理员";
    }
    if (governanceRole.id === "pm") {
      return "成员";
    }
    return governanceRole.name;
  }
  const customRole = customRoles.find((item) => item.key === normalizedRole);
  if (customRole) {
    return customRole.label;
  }
  return ROLE_LABELS[role] || role;
}

function resolveMemberTeamName(role: string, governanceRoles: GovernanceRole[], customRoles: GovernanceCustomRoleSummary[]) {
  const normalizedRole = normalizeBindingRole(role);
  if (normalizedRole === "owner") {
    return "基础架构组";
  }
  if (normalizedRole === "pm") {
    return "前端研发组";
  }
  if (normalizedRole === "developer") {
    return "研发工程组";
  }
  if (normalizedRole === "qa") {
    return "质量保证组";
  }
  if (normalizedRole === "viewer") {
    return "平台观察组";
  }
  if (customRoles.some((item) => item.key === normalizedRole)) {
    return "自定义权限组";
  }
  return governanceRoles.find((item) => item.id === normalizedRole)?.name || "权限角色组";
}

export function formatDate(dateLike: string): string {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayNameFromUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return DISPLAY_NAMES[hash % DISPLAY_NAMES.length] || "平台成员";
}

export function toPermissionMemberRows(
  items: PlatformRoleBindingPayload[],
  governanceRoles: GovernanceRole[] = [],
  customRoles: GovernanceCustomRoleSummary[] = []
): PermissionMemberRow[] {
  return items.map((item) => ({
    userId: item.userId,
    displayName: displayNameFromUserId(item.userId),
    role: item.role,
    roleLabel: resolveMemberRoleLabel(item.role, governanceRoles, customRoles),
    teamName: resolveMemberTeamName(item.role, governanceRoles, customRoles),
    joinedAt: formatDate(item.createdAt),
    statusLabel: normalizeBindingRole(item.role) === "viewer" ? "禁用" : "正常",
    statusTone: normalizeBindingRole(item.role) === "viewer" ? "muted" : "ok"
  }));
}

export function buildMemberBindingRoleOptions(
  governanceRoles: GovernanceRole[],
  customRoles: GovernanceCustomRoleSummary[]
): Array<{ value: string; label: string }> {
  const governanceOptions = governanceRoles
    .filter((item) => item.id === "owner" || item.id === "pm")
    .map((item) => ({
      value: item.id,
      label: item.id === "owner" ? "超级管理员" : "成员"
    }));
  return [...governanceOptions, ...customRoles.map((item) => ({ value: item.key, label: item.label }))];
}

function groupKeyOf(permission: string): string {
  const split = permission.split(":")[0]?.trim().toLowerCase();
  if (!split) {
    return "other";
  }
  return Object.prototype.hasOwnProperty.call(GROUP_TITLES, split) ? split : "other";
}

function permissionLabel(permission: string): string {
  const mapped = PERMISSION_LABEL_MAP[permission];
  if (mapped && mapped.length > 0) {
    return mapped[0];
  }
  return permission.replace(/[:*]/g, " / ");
}

function permissionLabels(permission: string): string[] {
  const mapped = PERMISSION_LABEL_MAP[permission];
  if (mapped && mapped.length > 0) {
    return mapped;
  }
  return [permissionLabel(permission)];
}

export function toPermissionGroups(permissions: string[]): PermissionGroup[] {
  const grouped = new Map<string, string[]>();
  permissions.forEach((permission) => {
    const key = groupKeyOf(permission);
    const list = grouped.get(key) || [];
    list.push(...permissionLabels(permission));
    grouped.set(key, list);
  });

  return GROUP_ORDER.filter((key) => grouped.has(key)).map((key) => ({
    key,
    title: GROUP_TITLES[key],
    items: grouped.get(key) || []
  }));
}

export function resolvePermissionTabPanels(activeTab: PermissionTab) {
  return {
    showMembersPanel: activeTab === "members",
    showRolePanel: activeTab === "roles"
  };
}

export function mapMemberPresetRoleToPlatformRole(preset: MemberPresetRole): PlatformRole {
  if (preset === "super_admin") {
    return "admin";
  }
  return "member";
}

export function isBuiltinLockedRole(roleKey: string): roleKey is BuiltinRoleMatrixKey {
  return BUILTIN_LOCKED_ROLE_KEYS.includes(roleKey as BuiltinRoleMatrixKey);
}

export function canAccessGovernanceEntries(role: "owner" | "pm" | "developer" | "qa" | "viewer") {
  return role === "owner";
}

export function isValidMainlandPhone(phone: string) {
  return /^1\d{10}$/.test(phone.trim());
}
