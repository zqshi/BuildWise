import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, currentUserId, isAdmin, parsePositiveInt } from "./workspaceRouteUtils";

export function registerWorkspacePolicyGlobalRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/governance/orchestration/policies", async () => {
    return {
      active: service.governance.getActiveGlobalOrchestrationPolicy(),
      items: service.governance.listGlobalOrchestrationPolicies()
    };
  });

  app.post("/governance/orchestration/policies", {
    schema: {
      body: {
        type: "object",
        properties: {
          strategy: { type: "object" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "没有权限" };
    }
    const body = request.body as { strategy?: Record<string, unknown> } | null;
    const actor = currentUserId(request);
    return service.governance.createGlobalOrchestrationPolicyDraft(actor, body?.strategy);
  });

  app.post("/governance/orchestration/policies/:version/activate", {
    schema: {
      params: {
        type: "object",
        properties: {
          version: { type: "string", pattern: "^\\d+$" }
        },
        required: ["version"]
      }
    }
  }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "没有权限" };
    }
    const params = request.params as { version: string };
    const version = parsePositiveInt(params.version);
    if (version === null) {
      reply.code(400);
      return { message: "无效的版本号" };
    }
    const actor = currentUserId(request);
    const activated = service.governance.activateGlobalOrchestrationPolicy(version, actor);
    if (!activated) {
      reply.code(404);
      return { message: "全局编排策略版本不存在" };
    }
    return activated;
  });

  app.post("/governance/orchestration/policies/restore-initial", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "没有权限" };
    }
    const actor = currentUserId(request);
    const restored = service.governance.restoreGlobalOrchestrationPolicyToInitialMode(actor);
    if (!restored) {
      reply.code(500);
      return { message: "全局编排策略恢复失败" };
    }
    return restored;
  });
}
