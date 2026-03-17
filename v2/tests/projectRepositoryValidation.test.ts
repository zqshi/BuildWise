import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateRepositoryRemoteUrl } from "../backend/src/application/workspace/workspaceServiceProjectRepoHealthOps.ts";

test("validateRepositoryRemoteUrl rejects malformed git addresses before probing", () => {
  const result = validateRepositoryRemoteUrl({ url: "not-a-git-url" });

  assert.equal(result.ok, false);
  assert.match(result.message, /地址格式不正确/);
});

test("validateRepositoryRemoteUrl reports remote probe failures", () => {
  const result = validateRepositoryRemoteUrl(
    { url: "https://github.com/acme/missing-repo.git" },
    () => ({ status: 128, stdout: "", stderr: "Repository not found" })
  );

  assert.equal(result.ok, false);
  assert.equal(result.message, "Repository not found");
});

test("validateRepositoryRemoteUrl accepts reachable remotes", () => {
  const result = validateRepositoryRemoteUrl(
    { url: "https://github.com/acme/buildwise.git" },
    () => ({ status: 0, stdout: "deadbeef\trefs/heads/main", stderr: "" })
  );

  assert.equal(result.ok, true);
  assert.equal(result.message, "");
});

test("repository routes expose remote validation and bootstrap guard", () => {
  const routeSource = readFileSync(new URL("../backend/src/interfaces/http/routes/repositoryTraceRoutes.ts", import.meta.url), "utf8");
  const opsSource = readFileSync(new URL("../backend/src/application/workspace/workspaceServiceProjectOps.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(new URL("../src/pages/projects/ProjectOverviewPanel.tsx", import.meta.url), "utf8");
  const drawerSource = readFileSync(new URL("../src/pages/projects/ProjectOverviewPanelRepositoryDrawer.tsx", import.meta.url), "utf8");

  assert.match(routeSource, /\/repository\/validate/);
  assert.match(opsSource, /remote_validation_failed/);
  assert.match(panelSource, /validateProjectRepositoryRemote/);
  assert.match(panelSource, /runRepositoryRemoteValidation/);
  assert.match(panelSource, /setRepoConfigStep\(1\);/);
  assert.match(panelSource, /仓库地址校验未通过，请修正后再保存。/);
  assert.match(drawerSource, /校验失败将不能继续/);
});
