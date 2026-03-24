import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { WorkspaceService } = await import("../dist/application/workspace/workspaceService.js");

test("workspace binding rejects sharing the same workspace path across projects", () => {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push(
    { id: 1, name: "项目A", description: "", status: "active", createdAt: "", updatedAt: "" },
    { id: 2, name: "项目B", description: "", status: "active", createdAt: "", updatedAt: "" }
  );

  const service = new WorkspaceService(repo, null, null);
  const sharedPath = join(tmpdir(), "buildwise-shared-workspace");

  const first = service.upsertProjectWorkspaceBinding({
    projectId: 1,
    openclawProfile: "buildwise-local",
    agentId: "main",
    workspacePath: sharedPath,
    runtimeMode: "openclaw-native",
    locked: true,
    createdBy: "tester"
  });

  assert.equal(first.workspacePath, sharedPath);

  assert.throws(
    () =>
      service.upsertProjectWorkspaceBinding({
        projectId: 2,
        openclawProfile: "buildwise-local",
        agentId: "main",
        workspacePath: sharedPath,
        runtimeMode: "openclaw-native",
        locked: true,
        createdBy: "tester"
      }),
    /workspace_path_already_bound/
  );
});
