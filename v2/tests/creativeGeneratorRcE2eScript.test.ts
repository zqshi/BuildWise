import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const v2Dir = resolve(testDir, "..");
const rcScriptPath = resolve(v2Dir, "scripts", "run-creative-generator-rc-e2e.mjs");
const cleanScriptPath = resolve(v2Dir, "scripts", "clean-workspace.sh");
const seedScriptPath = resolve(v2Dir, "scripts", "seed-creative-generator-demo-scaffold.mjs");
const setupScriptPath = resolve(v2Dir, "scripts", "setup-creative-generator-demo.mjs");

test("rc creative generator runner isolates runtime data outside the repo", () => {
  const source = readFileSync(rcScriptPath, "utf-8");
  assert.match(source, /mkdtempSync\(join\(tmpdir\(\), "buildwise-creative-generator-rc-"\)\)/);
  assert.match(source, /const DATA_FILE = join\(RUN_ROOT, "data\.runtime\.json"\)/);
  assert.match(source, /const WORKSPACE_PATH = join\(RUN_ROOT, "project-workspaces", "project-1"\)/);
  assert.match(source, /STORAGE_BACKEND: "json"/);
  assert.match(source, /BUILDWISE_DEMO_DATA_FILES: DATA_FILE/);
  assert.match(source, /BUILDWISE_DEMO_WORKSPACE_PATH: WORKSPACE_PATH/);
  assert.match(source, /BUILDWISE_DEMO_ARTIFACTS_DIR: SETUP_ARTIFACTS_DIR/);
  assert.match(source, /BUILDWISE_BROWSER_USE_TARGET_URL: `\$\{FRONTEND_URL\}\/app\.html#\/dashboard`/);
  assert.match(source, /BUILDWISE_E2E_ARTIFACTS_DIR: BROWSER_USE_ARTIFACTS_DIR/);
  assert.match(source, /BUILDWISE_E2E_LATEST_SETUP: join\(SETUP_ARTIFACTS_DIR, "creative-generator-demo-latest\.json"\)/);
  assert.match(source, /BUILDWISE_E2E_TARGET_URL: `\$\{FRONTEND_URL\}\/app\.html#\/dashboard`/);
  assert.match(source, /process\.stdout\.write\(text\)/);
  assert.match(source, /process\.stderr\.write\(text\)/);
  assert.match(source, /item\.proc\.kill\("SIGTERM"\)/);
  assert.match(source, /item\.proc\.exitCode === null/);
  assert.match(source, /item\.proc\.kill\("SIGKILL"\)/);
  assert.match(source, /writeFileSync\(REPORT_PATH/);
});

test("workspace cleanup script removes generated project knowledge and e2e artifacts", () => {
  const source = readFileSync(cleanScriptPath, "utf-8");
  assert.match(source, /"\$ROOT_DIR\/\.artifacts"/);
  assert.match(source, /"\$ROOT_DIR\/index"/);
  assert.match(source, /"\$ROOT_DIR\/memory"/);
  assert.match(source, /"\$ROOT_DIR\/shards"/);
  assert.match(source, /"\$ROOT_DIR\/workspace\.json"/);
  assert.match(source, /"\$ROOT_DIR\/\.buildwise"/);
  assert.match(source, /"\$ROOT_DIR\/tmp\/e2e-reports"/);
  assert.match(source, /"\$BACKEND_DIR\/data\.runtime\.json"/);
});

test("creative generator setup and seed scripts support isolated runtime overrides", () => {
  const seedSource = readFileSync(seedScriptPath, "utf-8");
  assert.match(seedSource, /BUILDWISE_DEMO_DATA_FILES/);
  assert.match(seedSource, /BUILDWISE_DEMO_WORKSPACE_PATH/);
  assert.match(seedSource, /const TARGET_DATA_FILES = DATA_FILES.length > 0 \? DATA_FILES : \[resolve\(ROOT, "data\.json"\), resolve\(ROOT, "data\.runtime\.json"\)\]/);
  assert.doesNotMatch(seedSource, /for \(const file of DATA_FILES\)/);

  const setupSource = readFileSync(setupScriptPath, "utf-8");
  assert.match(setupSource, /BUILDWISE_DEMO_ARTIFACTS_DIR/);
  assert.match(setupSource, /BUILDWISE_BROWSER_USE_TARGET_URL/);
  assert.match(setupSource, /browserUseTarget: \{ url: BROWSER_USE_TARGET_URL, loginPhone: "13800138000" \}/);
});
