import assert from "node:assert/strict";
import test from "node:test";
import { resolveSidebarViewState } from "../src/app/assistantNavigation.ts";

test("resolveSidebarViewState should always close assistant workspace when switching by sidebar", () => {
  const dashboard = resolveSidebarViewState("dashboard");
  assert.equal(dashboard.activeView, "dashboard");
  assert.equal(dashboard.showAssistantWorkspace, false);

  const projects = resolveSidebarViewState("projects");
  assert.equal(projects.activeView, "projects");
  assert.equal(projects.showAssistantWorkspace, false);

  const permissions = resolveSidebarViewState("permissions");
  assert.equal(permissions.activeView, "permissions");
  assert.equal(permissions.showAssistantWorkspace, false);
});
