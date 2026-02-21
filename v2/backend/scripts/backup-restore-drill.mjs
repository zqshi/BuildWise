import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const STORAGE_BACKEND = process.env.STORAGE_BACKEND || "json";
const WORKSPACE_DATA_FILE = resolve(process.env.WORKSPACE_DATA_FILE || "./data.json");
const WORKSPACE_DB_FILE = resolve(process.env.WORKSPACE_DB_FILE || "./data.db");
const BACKUP_ROOT = resolve(process.env.BACKUP_ROOT || "./backups");

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function nowToken() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function jsonDrill(targetDir) {
  if (!existsSync(WORKSPACE_DATA_FILE)) {
    throw new Error(`workspace data file not found: ${WORKSPACE_DATA_FILE}`);
  }
  const backupFile = resolve(targetDir, basename(WORKSPACE_DATA_FILE));
  copyFileSync(WORKSPACE_DATA_FILE, backupFile);

  const restoredPath = resolve(targetDir, "restore-check.json");
  copyFileSync(backupFile, restoredPath);

  const parsed = JSON.parse(readFileSync(restoredPath, "utf-8"));
  const projectCount = Array.isArray(parsed?.projects) ? parsed.projects.length : 0;
  const iterationCount = Array.isArray(parsed?.iterations) ? parsed.iterations.length : 0;

  return {
    backupFile,
    restoredPath,
    projectCount,
    iterationCount,
    fileSizeBytes: statSync(backupFile).size
  };
}

function sqliteDrill(targetDir) {
  if (!existsSync(WORKSPACE_DB_FILE)) {
    throw new Error(`workspace db file not found: ${WORKSPACE_DB_FILE}`);
  }

  const backupDb = resolve(targetDir, basename(WORKSPACE_DB_FILE));
  copyFileSync(WORKSPACE_DB_FILE, backupDb);

  for (const suffix of ["-wal", "-shm"]) {
    const src = `${WORKSPACE_DB_FILE}${suffix}`;
    if (existsSync(src)) {
      copyFileSync(src, `${backupDb}${suffix}`);
    }
  }

  const restoreDb = resolve(targetDir, "restore-check.db");
  copyFileSync(backupDb, restoreDb);

  const db = new DatabaseSync(restoreDb);
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='workspace_collections'")
    .get();
  const hasCollections = Number(row?.count || 0) > 0;
  const projectsRow = hasCollections
    ? db.prepare("SELECT COUNT(*) AS count FROM projects").get()
    : { count: 0 };
  const projectCount = Number(projectsRow?.count || 0);
  db.close();

  return {
    backupFile: backupDb,
    restoredPath: restoreDb,
    hasCollections,
    projectCount,
    fileSizeBytes: statSync(backupDb).size
  };
}

function main() {
  const timestamp = nowToken();
  const targetDir = resolve(BACKUP_ROOT, `drill-${timestamp}`);
  ensureDir(targetDir);

  const mode = STORAGE_BACKEND === "sqlite" ? "sqlite" : "json";
  const result = mode === "sqlite" ? sqliteDrill(targetDir) : jsonDrill(targetDir);

  const report = {
    drilledAt: new Date().toISOString(),
    backend: mode,
    source: mode === "sqlite" ? WORKSPACE_DB_FILE : WORKSPACE_DATA_FILE,
    backupDir: targetDir,
    result
  };

  console.log(JSON.stringify(report, null, 2));

  if (process.env.DRILL_CLEANUP === "true") {
    rmSync(targetDir, { recursive: true, force: true });
    console.log(`[backup-drill] cleaned: ${targetDir}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[backup-drill] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
