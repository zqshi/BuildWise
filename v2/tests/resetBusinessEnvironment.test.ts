import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const v2Dir = resolve(testDir, "..");
const scriptPath = resolve(v2Dir, "scripts", "reset-business-environment.mjs");

test("reset-business-environment restores workspace runtime files to initial state", () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "buildwise-reset-env-"));
  const backendDir = resolve(sandboxRoot, "backend");
  const artifactsDir = resolve(sandboxRoot, ".artifacts");
  const memoryDir = resolve(sandboxRoot, "memory");

  mkdirSync(backendDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(memoryDir, { recursive: true });

  writeFileSync(
    resolve(backendDir, "data.runtime.json"),
    JSON.stringify(
      {
        projects: [{ id: 99, name: "线索协同看板演示项目" }],
        iterations: [{ id: 10, projectId: 99 }],
        messages: [{ id: 11, iterationId: 10 }]
      },
      null,
      2
    ),
    "utf-8"
  );
  writeFileSync(resolve(artifactsDir, "mock.json"), "{}", "utf-8");
  writeFileSync(resolve(memoryDir, "knowledge.json"), "{}", "utf-8");

  execFileSync("node", [scriptPath], {
    cwd: v2Dir,
    env: { ...process.env, BUILDWISE_RESET_ROOT: sandboxRoot },
    stdio: "pipe"
  });

  const runtimeData = JSON.parse(readFileSync(resolve(backendDir, "data.runtime.json"), "utf-8")) as Record<string, any>;
  const seedData = JSON.parse(readFileSync(resolve(backendDir, "data.json"), "utf-8")) as Record<string, any>;
  const modelingData = JSON.parse(readFileSync(resolve(backendDir, "continuous-modeling.runtime.json"), "utf-8")) as Record<string, any>;
  const openclawData = JSON.parse(readFileSync(resolve(backendDir, "openclaw-global.runtime.json"), "utf-8")) as Record<string, any>;

  assert.equal(runtimeData.projects.length, 1);
  assert.equal(runtimeData.projects[0]?.name, "构想智造平台");
  assert.deepEqual(runtimeData.iterations, []);
  assert.deepEqual(runtimeData.snapshots, []);
  assert.deepEqual(runtimeData.transitions, []);
  assert.deepEqual(runtimeData.messages, []);
  assert.deepEqual(seedData.iterations, []);
  assert.deepEqual(modelingData.snapshots, []);
  assert.deepEqual(openclawData.conversations, []);
  assert.equal(existsSync(artifactsDir), false);
  assert.equal(existsSync(memoryDir), false);
});

test("reset-business-environment clears dashboard source datasets", () => {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "buildwise-reset-dashboard-"));
  const backendDir = resolve(sandboxRoot, "backend");

  mkdirSync(backendDir, { recursive: true });
  writeFileSync(
    resolve(backendDir, "data.runtime.json"),
    JSON.stringify(
      {
        projects: [
          { id: 7, name: "旧项目", status: "completed" },
          { id: 8, name: "另一个项目", status: "in-progress" }
        ],
        iterations: [
          { id: 71, projectId: 7, status: "completed", progress: 100, createdAt: "2026-02-01T00:00:00.000Z" },
          { id: 81, projectId: 8, status: "in-progress", progress: 40, createdAt: "2026-03-01T00:00:00.000Z" }
        ],
        snapshots: [{ id: 1, iterationId: 71, progress: 100 }],
        transitions: [{ id: 2, iterationId: 81, fromStatus: "planned", toStatus: "in-progress" }]
      },
      null,
      2
    ),
    "utf-8"
  );

  execFileSync("node", [scriptPath], {
    cwd: v2Dir,
    env: { ...process.env, BUILDWISE_RESET_ROOT: sandboxRoot },
    stdio: "pipe"
  });

  const runtimeData = JSON.parse(readFileSync(resolve(backendDir, "data.runtime.json"), "utf-8")) as Record<string, any>;

  assert.equal(runtimeData.projects.length, 1);
  assert.deepEqual(runtimeData.iterations, []);
  assert.deepEqual(runtimeData.snapshots, []);
  assert.deepEqual(runtimeData.transitions, []);
});

