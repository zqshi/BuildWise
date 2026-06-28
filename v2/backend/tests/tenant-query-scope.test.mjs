import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { SqliteWorkspaceRepository } = await import(
  "../dist/infrastructure/persistence/sqliteWorkspaceRepository.js"
);

// ─── v0.23.0 T3：查询层硬隔离（DB 层兜底）──
// 应用层已有 listProjectsForUser + getProjectAccessContext 做租户过滤，但 listProjects() 仓库方法全表扫，
// 调用方各自 .filter，漏一个就跨租户串。T3 给 listProjects 加可选 tenantId 参数，SQL 层 WHERE 过滤作 DB 兜底。
// Red：listProjects("tenant-B") 不应返回 tenant-A 的项目。

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "buildwise-t3-query-scope-"));
  const dbFile = path.join(dir, "workspace.db");
  const repo = new SqliteWorkspaceRepository(dbFile, undefined, { bootstrapMode: "empty" });
  return { repo, dir };
}

test("listProjects(tenantId) 仅返回该租户项目（DB 层硬隔离兜底）", () => {
  const { repo } = makeRepo();
  repo.createProject({ name: "项目A", description: "", tenantId: "tenant-A", ownerUserId: "owner-a" });
  repo.createProject({ name: "项目B", description: "", tenantId: "tenant-B", ownerUserId: "owner-b" });

  const tenantBProjects = repo.listProjects("tenant-B");
  assert.ok(tenantBProjects.every((p) => p.tenantId === "tenant-B"), "listProjects(tenant-B) 不应含 tenant-A 项目");
  assert.equal(tenantBProjects.length, 1);
  assert.equal(tenantBProjects[0].name, "项目B");
});

test("listProjects() 不传 tenantId 保持全表（向后兼容，真超管/系统巡检用）", () => {
  const { repo } = makeRepo();
  repo.createProject({ name: "项目A", description: "", tenantId: "tenant-A", ownerUserId: "owner-a" });
  repo.createProject({ name: "项目B", description: "", tenantId: "tenant-B", ownerUserId: "owner-b" });

  const all = repo.listProjects();
  assert.equal(all.length, 2, "不传 tenantId 应返回全部，向后兼容");
});

test("findProject(projectId, tenantId) 跨租户查返回 null（DB 层兜底，应用层漏判时拦截）", () => {
  const { repo } = makeRepo();
  const projA = repo.createProject({ name: "项目A", description: "", tenantId: "tenant-A", ownerUserId: "owner-a" });

  // tenant-B 查 tenant-A 的项目 id → 应返回 null（DB 层拦截跨租户访问）
  const crossTenant = repo.findProject(projA.id, "tenant-B");
  assert.equal(crossTenant, null, "findProject 带 tenantId 时跨租户访问应返回 null");

  // 同租户查 → 正常返回
  const ownTenant = repo.findProject(projA.id, "tenant-A");
  assert.ok(ownTenant, "同租户查应正常返回");

  // 不传 tenantId → 向后兼容，正常返回（真超管/系统巡检路径）
  const noScope = repo.findProject(projA.id);
  assert.ok(noScope, "不传 tenantId 应向后兼容返回");
});
