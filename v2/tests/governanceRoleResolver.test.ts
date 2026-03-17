import assert from "node:assert/strict";
import test from "node:test";
import {
  inferWorkspaceRoleFromPermissions,
  resolveRolePermissions,
  resolveWorkspaceRole
} from "../backend/src/application/workspace/governanceRoleResolver.ts";
import type { GovernanceRole } from "../backend/src/domain/workspace/types.ts";
import type { GovernanceCustomRoleRecord } from "../backend/src/domain/workspace/collaborationTypes.ts";

const governanceRoles: GovernanceRole[] = [
  { id: "owner", name: "系统负责人", permissions: ["dashboard:view", "governance:*", "workspace:*"] },
  { id: "pm", name: "产品经理", permissions: ["dashboard:view", "workspace:read", "workspace:write", "iteration:transition"] },
  { id: "developer", name: "研发工程师", permissions: ["dashboard:view", "model:read", "model:write", "deploy:write", "deploy:read"] },
  { id: "qa", name: "测试工程师", permissions: ["dashboard:view", "trace:read", "assessment:recompute", "deploy:transition"] },
  { id: "viewer", name: "只读成员", permissions: ["dashboard:view", "workspace:read"] }
] ;

const customRoles: GovernanceCustomRoleRecord[] = [
  {
    id: 1,
    roleKey: "solution-architect",
    name: "解决方案架构师",
    description: "",
    level: 3,
    permissions: ["dashboard:view", "model:read", "model:write", "deploy:write", "deploy:read"],
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z"
  }
];

test("resolve role permissions supports legacy platform roles and custom roles", () => {
  assert.deepEqual(resolveRolePermissions("admin", governanceRoles, []), ["dashboard:view", "governance:*", "workspace:*"]);
  assert.deepEqual(resolveRolePermissions("solution-architect", governanceRoles, customRoles), customRoles[0]?.permissions);
});

test("resolve workspace role preserves builtin governance roles", () => {
  assert.equal(resolveWorkspaceRole("owner", governanceRoles, []), "owner");
  assert.equal(resolveWorkspaceRole("pm", governanceRoles, []), "pm");
  assert.equal(resolveWorkspaceRole("viewer", governanceRoles, []), "viewer");
});

test("infer workspace role maps custom permissions to closest builtin role", () => {
  assert.equal(inferWorkspaceRoleFromPermissions(["dashboard:view", "workspace:read", "workspace:write", "iteration:transition"], governanceRoles), "pm");
  assert.equal(inferWorkspaceRoleFromPermissions(customRoles[0]?.permissions || [], governanceRoles), "developer");
  assert.equal(resolveWorkspaceRole("solution-architect", governanceRoles, customRoles), "developer");
});
