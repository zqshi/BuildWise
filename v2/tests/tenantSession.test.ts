import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCurrentTenant,
  resolveCurrentTenantId,
  type AuthTenantSummary
} from "../src/infrastructure/auth/tenantSession.ts";

const tenants: AuthTenantSummary[] = [
  { tenantId: "tenant-a", label: "Tenant A", role: "admin", workspaceRole: "owner", isOwner: true },
  { tenantId: "tenant-b", label: "Tenant B", role: "member", workspaceRole: "pm", isOwner: false }
];

test("resolveCurrentTenantId prefers requested tenant when accessible", () => {
  assert.equal(resolveCurrentTenantId(tenants, "tenant-b"), "tenant-b");
});

test("resolveCurrentTenantId falls back to first accessible tenant", () => {
  assert.equal(resolveCurrentTenantId(tenants, "tenant-x"), "tenant-a");
  assert.equal(resolveCurrentTenantId([], "tenant-x"), "");
});

test("resolveCurrentTenant returns matching tenant summary", () => {
  assert.deepEqual(resolveCurrentTenant(tenants, "tenant-b"), tenants[1]);
  assert.equal(resolveCurrentTenant([], "tenant-a"), null);
});
