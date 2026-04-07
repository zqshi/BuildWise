import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { GovernancePermissionPoint, GovernanceRole } from "../../domain/workspace/types";

const GOVERNANCE_PERMISSION_POINTS: GovernancePermissionPoint[] = [
  { key: "dashboard:view", title: "查看仪表盘", module: "dashboard", sourceType: "page", source: "/dashboard" },
  { key: "projects:view", title: "查看项目工作台", module: "workspace", sourceType: "page", source: "/projects" },
  { key: "permissions:view", title: "查看权限管理页", module: "governance", sourceType: "page", source: "/permissions" },
  { key: "workspace:read", title: "查看项目与成员信息", module: "workspace", sourceType: "api", source: "workspace read APIs" },
  { key: "workspace:write", title: "编辑项目与迭代配置", module: "workspace", sourceType: "api", source: "workspace write APIs" },
  { key: "workspace:*", title: "项目管理全权限", module: "workspace", sourceType: "api", source: "workspace all APIs" },
  { key: "iteration:transition", title: "推进迭代流程状态", module: "iteration", sourceType: "api", source: "POST /api/v1/iterations/:id/state/transition" },
  {
    key: "iteration:transition:complete",
    title: "执行迭代完成态流转",
    module: "iteration",
    sourceType: "api",
    source: "iteration completion transition APIs"
  },
  { key: "model:read", title: "查看模型结构与规则", module: "model", sourceType: "api", source: "model read APIs" },
  { key: "model:write", title: "编辑模型结构与规则", module: "model", sourceType: "api", source: "model write APIs" },
  { key: "model:*", title: "模型管理全权限", module: "model", sourceType: "api", source: "model all APIs" },
  { key: "trace:read", title: "查看追溯分析报告", module: "trace", sourceType: "api", source: "GET /api/v1/trace*" },
  { key: "assessment:recompute", title: "重算质量评估", module: "assessment", sourceType: "api", source: "POST /api/v1/iterations/:id/assessment/recompute" },
  { key: "governance:*", title: "权限治理全权限", module: "governance", sourceType: "api", source: "/api/v1/governance/*" },
  { key: "policy:read", title: "查看策略与门禁", module: "policy", sourceType: "api", source: "GET /api/v1/projects/:id/policies" },
  { key: "collab:read", title: "查看协作快照与共享", module: "collab", sourceType: "api", source: "GET /api/v1/collab/*" },
  { key: "collab:write", title: "创建快照与共享链接", module: "collab", sourceType: "api", source: "POST /api/v1/collab/*" },
  { key: "template:run", title: "执行平台模板", module: "template", sourceType: "api", source: "POST /api/v1/templates/:id/run" },
  { key: "deploy:read", title: "查看部署与运维指标", module: "deploy", sourceType: "api", source: "GET /api/v1/ops/*" },
  { key: "deploy:write", title: "创建部署与运维动作", module: "deploy", sourceType: "api", source: "POST /api/v1/ops/deployments*" },
  { key: "deploy:transition", title: "推进部署状态", module: "deploy", sourceType: "api", source: "POST /api/v1/ops/deployments/:id/transition" }
];

export function listGovernanceRolesOp(): GovernanceRole[] {
  return [
    {
      id: "owner",
      name: "系统负责人",
      permissions: ["*", "dashboard:view", "projects:view", "permissions:view", "workspace:*", "model:*", "governance:*"]
    },
    {
      id: "pm",
      name: "产品经理",
      permissions: ["dashboard:view", "projects:view", "workspace:read", "workspace:write", "collab:write", "collab:read", "iteration:transition", "iteration:transition:complete", "template:run", "deploy:read", "policy:read"]
    },
    {
      id: "developer",
      name: "研发工程师",
      permissions: ["dashboard:view", "projects:view", "workspace:read", "collab:read", "model:read", "model:write", "template:run", "deploy:write", "deploy:read", "iteration:transition"]
    },
    {
      id: "qa",
      name: "测试工程师",
      permissions: ["dashboard:view", "projects:view", "workspace:read", "collab:read", "trace:read", "assessment:recompute", "deploy:read", "deploy:transition", "iteration:transition"]
    },
    { id: "viewer", name: "只读成员", permissions: ["dashboard:view", "projects:view", "workspace:read", "model:read", "collab:read", "policy:read"] }
  ];
}

export function listGovernancePermissionPointsOp(): GovernancePermissionPoint[] {
  return [...GOVERNANCE_PERMISSION_POINTS];
}

export function listAuditLogsOp(repo: WorkspaceRepository, limit = 50) {
  return repo.listAuditLogs(limit);
}
