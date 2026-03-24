import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const { JsonWorkspaceRepository } = await import("../dist/infrastructure/persistence/jsonWorkspaceRepository.js");
const { SqliteWorkspaceRepository } = await import("../dist/infrastructure/persistence/sqliteWorkspaceRepository.js");

test("json workspace repository can bootstrap an empty store without seed project", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "buildwise-bootstrap-"));
  const dataFile = path.join(tempDir, "workspace.json");
  try {
    const repository = new JsonWorkspaceRepository(dataFile, { bootstrapMode: "empty" });
    const store = repository.read();
    assert.equal(store.projects.length, 0);
    assert.equal(store.tenantMemberBindings.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("sqlite workspace repository bootstraps seed data before typed reads", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "buildwise-sqlite-bootstrap-"));
  const dbFile = path.join(tempDir, "workspace.db");
  const seedFile = path.join(process.cwd(), "data.json");
  try {
    const repository = new SqliteWorkspaceRepository(dbFile, seedFile, { bootstrapMode: "seed" });
    const project = repository.findProject(1);
    const iteration = repository.findIteration(1);

    assert.equal(project?.id, 1);
    assert.equal(iteration?.id, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
