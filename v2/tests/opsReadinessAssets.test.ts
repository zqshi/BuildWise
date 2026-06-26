import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

test("docker compose gates backend readiness via /ready", () => {
  const compose = readFileSync(join(repoRoot, "docker-compose.yml"), "utf-8");
  assert.match(compose, /127\.0\.0\.1:5055\/ready/);
});

test("backend npm test builds dist before executing dist-based tests", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "backend/package.json"), "utf-8"));
  assert.equal(pkg.scripts.test, "npm run build && c8 node --test tests/*.test.mjs");
});

test("backend production release verify runs readiness then production contract release", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "backend/package.json"), "utf-8"));
  // verify:prod-release = 就绪检查(卫生/边界/Prompt/Agent/typecheck/build/单测) + 生产契约验证(三 scenario 端到端)
  // v0.12.0 重写契约脚本 /api→/api/v1 路径后挂回，恢复生产发布门禁
  assert.equal(
    pkg.scripts["verify:prod-release"],
    "npm run verify:prod-readiness && node scripts/verify-production-release.mjs"
  );
});

test("production env example uses safe production defaults", () => {
  const envExample = readFileSync(join(repoRoot, "backend/.env.production.example"), "utf-8");
  assert.match(envExample, /^NODE_ENV=production$/m);
  assert.match(envExample, /^AUTH_MODE=jwt$/m);
  assert.match(envExample, /^STORAGE_BACKEND=sqlite$/m);
  assert.match(envExample, /^ALLOW_SEED_DATA_BOOTSTRAP=false$/m);
});

test("sqlite backup drill auto-discovers workspace.db when no env override is provided", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "buildwise-backup-drill-"));
  const dbPath = join(tempRoot, "workspace.db");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT);");
  db.close();

  const scriptPath = join(repoRoot, "backend/scripts/backup-restore-drill.mjs");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: tempRoot,
    env: {
      ...process.env,
      STORAGE_BACKEND: "sqlite",
      DRILL_CLEANUP: "true"
    },
    encoding: "utf-8"
  });

  rmSync(tempRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"backend": "sqlite"/);
  assert.match(result.stdout, /workspace\.db/);
});
