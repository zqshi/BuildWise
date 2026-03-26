import assert from "node:assert/strict";
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

