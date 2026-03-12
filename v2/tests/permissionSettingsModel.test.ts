import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDate,
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
      role: "admin",
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T09:00:00.000Z"
    }
  ]);
  assert.ok(Boolean(rows[0]?.displayName));
  assert.equal(rows[0]?.roleLabel, "超级管理员");
  assert.equal(rows[0]?.teamName, "基础架构组");
  assert.equal(rows[0]?.joinedAt, "2026-03-01");
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
  assert.equal(mapMemberPresetRoleToPlatformRole("project_manager"), "member");
  assert.equal(mapMemberPresetRoleToPlatformRole("viewer"), "viewer");
});

test("mainland phone validator accepts 11-digit mobile and rejects invalid values", () => {
  assert.equal(isValidMainlandPhone("13800138000"), true);
  assert.equal(isValidMainlandPhone(" 13800138000 "), true);
  assert.equal(isValidMainlandPhone("23800138000"), false);
  assert.equal(isValidMainlandPhone("1380013800"), false);
  assert.equal(isValidMainlandPhone("138001380000"), false);
  assert.equal(isValidMainlandPhone("abc"), false);
});
