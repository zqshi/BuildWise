import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, currentUserId, isAdmin, parsePositiveInt } from "./workspaceRouteUtils";

function requireAdminRole(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!isAdmin(currentRole(request.authRole))) { reply.code(403); return false; }
  return true;
}

async function handleListPolicies(service: WorkspaceService) {
  return { active: service.governance.getActiveGlobalOrchestrationPolicy(), items: service.governance.listGlobalOrchestrationPolicies() };
}

async function handleCreatePolicy(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdminRole(request, reply)) return { message: "没有权限" };
  const body = request.body as { strategy?: Record<string, unknown> } | null;
  return service.governance.createGlobalOrchestrationPolicyDraft(currentUserId(request), body?.strategy);
}

async function handleActivatePolicy(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdminRole(request, reply)) return { message: "没有权限" };
  const version = parsePositiveInt((request.params as { version: string }).version);
  if (version === null) { reply.code(400); return { message: "无效的版本号" }; }
  const activated = service.governance.activateGlobalOrchestrationPolicy(version, currentUserId(request));
  if (!activated) { reply.code(404); return { message: "全局编排策略版本不存在" }; }
  return activated;
}

async function handleRestoreInitial(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdminRole(request, reply)) return { message: "没有权限" };
  const restored = service.governance.restoreGlobalOrchestrationPolicyToInitialMode(currentUserId(request));
  if (!restored) { reply.code(500); return { message: "全局编排策略恢复失败" }; }
  return restored;
}

export function registerWorkspacePolicyGlobalRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/governance/orchestration/policies", async () => handleListPolicies(service));

  app.post("/governance/orchestration/policies", {
    schema: { body: { type: "object", properties: { strategy: { type: "object" } }, additionalProperties: false } }
  }, (req, rep) => handleCreatePolicy(service, req, rep));

  app.post("/governance/orchestration/policies/:version/activate", {
    schema: { params: { type: "object", properties: { version: { type: "string", pattern: "^\\d+$" } }, required: ["version"] } }
  }, (req, rep) => handleActivatePolicy(service, req, rep));

  app.post("/governance/orchestration/policies/restore-initial",
    (req, rep) => handleRestoreInitial(service, req, rep));
}
