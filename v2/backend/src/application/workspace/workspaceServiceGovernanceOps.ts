import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { GovernanceRole } from "../../domain/workspace/types";

export function listGovernanceRolesOp(): GovernanceRole[] {
  return [
    { id: "owner", name: "系统负责人", permissions: ["workspace:*", "model:*", "governance:*"] },
    { id: "pm", name: "产品经理", permissions: ["workspace:read", "workspace:write", "iteration:transition"] },
    { id: "developer", name: "研发工程师", permissions: ["workspace:read", "model:read", "model:write"] },
    { id: "qa", name: "测试工程师", permissions: ["workspace:read", "trace:read", "assessment:recompute"] },
    { id: "viewer", name: "只读成员", permissions: ["workspace:read", "model:read"] }
  ];
}

export function listAuditLogsOp(repo: WorkspaceRepository, limit = 50) {
  return repo.listAuditLogs(limit);
}
