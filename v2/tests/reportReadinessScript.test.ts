import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";

const workspaceRoot = path.resolve(new URL("..", import.meta.url).pathname);
const scriptPath = path.join(workspaceRoot, "scripts", "report-readiness.mjs");
const repoMilestonesDir = path.resolve(workspaceRoot, "..", "docs", "milestones");

function runReadiness(env = {}) {
  return execFileSync(process.execPath, [scriptPath], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...env
    },
    encoding: "utf8"
  }).trim();
}

test("report-readiness writes to temp output by default instead of dirtying repo milestones", () => {
  const output = runReadiness();

  assert.match(output, /buildwise-readiness/);
  assert.doesNotMatch(output, /docs\/milestones/);
  assert.equal(existsSync(output), true);
});

test("report-readiness supports explicit output directory override", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "buildwise-readiness-test-"));
  try {
    const output = runReadiness({
      BUILDWISE_READINESS_OUTPUT_DIR: tempRoot
    });
    assert.match(output, new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(existsSync(output), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("report-readiness only writes to repo milestones when explicitly requested", () => {
  const output = runReadiness({
    BUILDWISE_READINESS_WRITE_REPO: "1"
  });

  assert.match(output, new RegExp(repoMilestonesDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(existsSync(output), true);
  rmSync(output, { force: true });
});
