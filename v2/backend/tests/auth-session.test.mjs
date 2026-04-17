import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerAuthRoutes } = await import("../dist/interfaces/http/routes/authRoutes.js");
const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");

function createConfig() {
  return {
    authMode: "off",
    authPublicPathPrefixes: [],
    authTokens: {},
    nodeEnv: "development",
    jwtSecret: "12345678901234567890123456789012",
    jwtAccessTtlSec: 900,
    jwtRefreshTtlSec: 604800
  };
}

test("/auth/session returns real accessible tenants and current tenant selection", async () => {
  const repo = createInMemoryWorkspaceRepo();
  const service = new WorkspaceService(repo, null, null);
  const app = Fastify();

  service.governance.upsertPlatformRoleBinding({ userId: "13800138000", role: "member" });
  service.governance.upsertTenantMemberBinding({ tenantId: "owner-a", userId: "13800138000", role: "member" });
  service.governance.upsertTenantMemberBinding({ tenantId: "owner-b", userId: "13800138000", role: "admin" });

  registerRuntimeAuth(app, createConfig());
  registerAuthRoutes(app, service, createConfig());

  const response = await app.inject({
    method: "GET",
    url: "/auth/session",
    headers: {
      "x-user-id": "13800138000",
      "x-role": "pm",
      "x-tenant-id": "owner-b"
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.currentTenantId, "owner-b");
  assert.deepEqual(
    payload.tenants.map((item) => ({ tenantId: item.tenantId, role: item.role })),
    [
      { tenantId: "owner-a", role: "member" },
      { tenantId: "owner-b", role: "admin" }
    ]
  );
  assert.equal(payload.user.workspaceRole, "owner");

  await app.close();
});

test("/auth/session rejects unknown platform user", async () => {
  const repo = createInMemoryWorkspaceRepo();
  const service = new WorkspaceService(repo, null, null);
  const app = Fastify();

  registerRuntimeAuth(app, createConfig());
  registerAuthRoutes(app, service, createConfig());

  const response = await app.inject({
    method: "GET",
    url: "/auth/session",
    headers: {
      "x-user-id": "13900139000",
      "x-role": "pm"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().message, "该用户未注册为平台成员");

  await app.close();
});
