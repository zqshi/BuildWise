import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMemberBindingRoleOptions,
  BUILTIN_ROLE_MATRIX_OPTIONS,
  canAccessGovernanceEntries,
  formatDate,
  isBuiltinLockedRole,
  isValidMainlandPhone,
  mapMemberPresetRoleToPlatformRole,
  resolvePermissionTabPanels,
  toPermissionGroups,
  toPermissionMemberRows,
  toWorkspaceRoleId
} from "../src/pages/governance/permissionSettingsModel.ts";

test("platform role maps to workspace governance role", () => {
  assert.equal(toWorkspaceRoleId("admin"), "owner");
  assert.equal(toWorkspaceRoleId("member"), "pm");
  assert.equal(toWorkspaceRoleId("viewer"), "viewer");
});

test("member rows preserve role labels and date format", () => {
  const rows = toPermissionMemberRows([
    {
      id: 1,
      userId: "13800138000",
      role: "owner",
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T09:00:00.000Z"
    }
  ], [
    { id: "owner", name: "系统负责人", permissions: ["governance:*"] },
    { id: "pm", name: "产品经理", permissions: ["workspace:read"] }
  ]);
  assert.ok(Boolean(rows[0]?.displayName));
  assert.equal(rows[0]?.roleLabel, "超级管理员");
  assert.equal(rows[0]?.teamName, "基础架构组");
  assert.equal(rows[0]?.joinedAt, "2026-03-01");
});

test("member rows resolve custom role labels from stored role keys", () => {
  const rows = toPermissionMemberRows(
    [
      {
        id: 1,
        userId: "13800138000",
        role: "solution-architect",
        createdAt: "2026-03-01T09:00:00.000Z",
        updatedAt: "2026-03-01T09:00:00.000Z"
      }
    ],
    [{ id: "owner", name: "系统负责人", permissions: ["governance:*"] }],
    [{ key: "solution-architect", label: "解决方案架构师", permissions: ["workspace:read"] }]
  );
  assert.equal(rows[0]?.roleLabel, "解决方案架构师");
  assert.equal(rows[0]?.teamName, "自定义权限组");
  assert.equal(rows[0]?.statusLabel, "正常");
});

test("permission groups are grouped by domain with stable order", () => {
  const groups = toPermissionGroups([
    "governance:*",
    "workspace:read",
    "workspace:write",
    "trace:read",
    "custom:ext"
  ]);
  assert.deepEqual(
    groups.map((item) => item.key),
    ["workspace", "trace", "governance", "other"]
  );
  const workspace = groups.find((item) => item.key === "workspace");
  assert.ok((workspace?.items.length || 0) >= 2);
});

test("invalid date uses placeholder", () => {
  assert.equal(formatDate("not-a-date"), "--");
});

test("tab panels are mutually exclusive", () => {
  const members = resolvePermissionTabPanels("members");
  assert.equal(members.showMembersPanel, true);
  assert.equal(members.showRolePanel, false);

  const roles = resolvePermissionTabPanels("roles");
  assert.equal(roles.showMembersPanel, false);
  assert.equal(roles.showRolePanel, true);
});

test("member preset role maps to platform role", () => {
  assert.equal(mapMemberPresetRoleToPlatformRole("super_admin"), "admin");
  assert.equal(mapMemberPresetRoleToPlatformRole("member"), "member");
});

test("member binding role options use real governance and custom roles", () => {
  const options = buildMemberBindingRoleOptions(
    [
      { id: "owner", name: "系统负责人", permissions: ["governance:*"] },
      { id: "pm", name: "产品经理", permissions: ["workspace:read"] },
      { id: "developer", name: "研发工程师", permissions: ["model:write"] }
    ],
    [{ key: "solution-architect", label: "解决方案架构师", permissions: ["workspace:read"] }]
  );
  assert.deepEqual(options, [
    { value: "owner", label: "超级管理员" },
    { value: "pm", label: "成员" },
    { value: "solution-architect", label: "解决方案架构师" }
  ]);
});

test("builtin role matrix includes locked member role", () => {
  assert.deepEqual(
    BUILTIN_ROLE_MATRIX_OPTIONS.map((item) => item.key),
    ["owner", "member"]
  );
  assert.equal(isBuiltinLockedRole("owner"), true);
  assert.equal(isBuiltinLockedRole("member"), true);
  assert.equal(isBuiltinLockedRole("custom-role"), false);
});

test("only owner can access governance entries", () => {
  assert.equal(canAccessGovernanceEntries("owner"), true);
  assert.equal(canAccessGovernanceEntries("pm"), false);
  assert.equal(canAccessGovernanceEntries("developer"), false);
  assert.equal(canAccessGovernanceEntries("qa"), false);
  assert.equal(canAccessGovernanceEntries("viewer"), false);
});

test("mainland phone validator accepts 11-digit mobile and rejects invalid values", () => {
  assert.equal(isValidMainlandPhone("13800138000"), true);
  assert.equal(isValidMainlandPhone(" 13800138000 "), true);
  assert.equal(isValidMainlandPhone("23800138000"), false);
  assert.equal(isValidMainlandPhone("1380013800"), false);
  assert.equal(isValidMainlandPhone("138001380000"), false);
  assert.equal(isValidMainlandPhone("abc"), false);
});
