import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { BacklogService } = await import(
  "../dist/application/workspace/backlog/backlogService.js"
);

function setup() {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({ name: "测试项目", description: "d", tenantId: "t1", ownerUserId: "u1" });
  const iteration = repo.createIteration(project.id, { name: "v1", description: "d" });
  const service = new BacklogService(repo);
  return { repo, project, iteration, service };
}

test("归属版本时 status 从 open 变为 planned", () => {
  const { project, iteration, service } = setup();
  const item = service.createBacklogItem(project.id, { title: "需求A" }, "pm");
  assert.equal(item.status, "open");

  service.assignToIteration(project.id, [item.id], iteration.id);

  const after = service.listBacklogItems(project.id).find((i) => i.id === item.id);
  assert.equal(after.iterationId, iteration.id);
  assert.equal(after.status, "planned");
});

test("取消归属时 status 从 planned 回退为 open（拖回需求池）", () => {
  const { project, iteration, service } = setup();
  const item = service.createBacklogItem(project.id, { title: "需求B" }, "pm");
  service.assignToIteration(project.id, [item.id], iteration.id);
  assert.equal(service.listBacklogItems(project.id).find((i) => i.id === item.id).status, "planned");

  // 拖回需求池：iterationId = null
  service.assignToIteration(project.id, [item.id], null);

  const after = service.listBacklogItems(project.id).find((i) => i.id === item.id);
  assert.equal(after.iterationId, null);
  assert.equal(after.status, "open");
});

test("取消归属时 in-progress/done 不回退（已进入执行/完成的不强制改回 open）", () => {
  const { project, iteration, service } = setup();
  const item = service.createBacklogItem(project.id, { title: "需求C" }, "pm");
  // 归属后手动推进到 in-progress（模拟开发中需求取消归属）
  service.assignToIteration(project.id, [item.id], iteration.id);
  service.updateBacklogItem(item.id, { status: "in-progress" });

  service.assignToIteration(project.id, [item.id], null);

  const after = service.listBacklogItems(project.id).find((i) => i.id === item.id);
  assert.equal(after.iterationId, null);
  assert.equal(after.status, "in-progress");
});
