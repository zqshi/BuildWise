import assert from "node:assert/strict";
import test from "node:test";
import { resolveSidebarViewState } from "../src/app/openclawNavigation.ts";

test("resolveSidebarViewState should always close openclaw workspace when switching by sidebar", () => {
  const dashboard = resolveSidebarViewState("dashboard");
  assert.equal(dashboard.activeView, "dashboard");
  assert.equal(dashboard.showOpenclawWorkspace, false);

  const projects = resolveSidebarViewState("projects");
  assert.equal(projects.activeView, "projects");
  assert.equal(projects.showOpenclawWorkspace, false);

  const permissions = resolveSidebarViewState("permissions");
  assert.equal(permissions.activeView, "permissions");
  assert.equal(permissions.showOpenclawWorkspace, false);
});
