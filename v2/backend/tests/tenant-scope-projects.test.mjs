import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { SqliteWorkspaceRepository } = await import(
  "../dist/infrastructure/persistence/sqliteWorkspaceRepository.js"
);
const { updateKnowledgeEntryOp } = await import(
  "../dist/application/workspace/knowledge/knowledgeOps.js"
);

// ─── v0.23.0 T2：修 syncTypedTables/insertProject/updateProject 不写 projects.tenant_id ──
// 核心 bug：projects.tenant_id 列存在（002 migration）但从不写入 → 永远 'default' →
// 全仓唯一 SQL 层 tenant 过滤 searchKnowledgeAcrossProjects 失效（传非 default tenantId 返回空）。
// 经 repo 公开方法暴露：searchKnowledgeAcrossProjects 是失效点本身。
// Red：租户A 灌 published 知识后用 tenant-A 搜索应命中（当前 bug 致全返回空）。

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "buildwise-tenant-scope-"));
  const dbFile = path.join(dir, "workspace.db");
  const repo = new SqliteWorkspaceRepository(dbFile, undefined, { bootstrapMode: "empty" });
  return { repo, dir };
}

function seedPublishedKnowledge(repo, projectId, owner) {
  const entry = repo.createKnowledgeEntry(projectId, {
    title: "线索状态机规则", content: "线索状态流转约束", category: "business-rule",
    groupName: "销售", applicableScene: "线索管理", tags: [], source: "manual", sourceRef: "",
  }, owner);
  updateKnowledgeEntryOp(repo, entry.id, { status: "published", reviewedBy: owner });
  return entry;
}

test("租户A 用 tenant-A 搜索应命中自己项目的知识（当前 bug：projects.tenant_id='default' 致返回空）", () => {
  const { repo } = makeRepo();
  const projA = repo.createProject({ name: "项目A", description: "", tenantId: "tenant-A", ownerUserId: "owner-a" });
  seedPublishedKnowledge(repo, projA.id, "owner-a");

  const results = repo.searchKnowledgeAcrossProjects("tenant-A", "线索");
  assert.ok(results.length > 0, "租户A 应能搜到自己项目的知识——当前 projects.tenant_id 永远 'default' 致 SQL 过滤失效返回空");
});

test("跨租户隔离：租户B 用 tenant-B 搜索不应命中租户A 的知识", () => {
  const { repo } = makeRepo();
  const projA = repo.createProject({ name: "项目A", description: "", tenantId: "tenant-A", ownerUserId: "owner-a" });
  repo.createProject({ name: "项目B", description: "", tenantId: "tenant-B", ownerUserId: "owner-b" });
  seedPublishedKnowledge(repo, projA.id, "owner-a");

  const resultsB = repo.searchKnowledgeAcrossProjects("tenant-B", "线索");
  assert.equal(resultsB.length, 0, "租户B 不应搜到租户A 的知识");
});
