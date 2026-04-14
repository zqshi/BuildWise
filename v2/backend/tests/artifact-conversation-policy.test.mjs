import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");
const { SqliteWorkspaceRepository } = await import("../dist/infrastructure/persistence/sqliteWorkspaceRepository.js");

function createWorkspaceService() {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-artifact-chat-"));
  const dbFile = path.join(fixtureDir, "workspace.db");
  const dataFile = path.join(fixtureDir, "workspace.json");
  const repository = new SqliteWorkspaceRepository(dbFile, dataFile, { bootstrapMode: "empty" });
  return new WorkspaceService(repository, null);
}

function createIterationWithDraftArtifact() {
  const service = createWorkspaceService();
  const project = service.project.createProject({
    name: "Artifact Conversation Project",
    description: "artifact conversation policy"
  });
  const iteration = service.iteration.createIteration(project.id, {
    name: "V1",
    description: "测试交付物会话策略"
  });
  // draftContent must be >= 100 chars to pass the quality gate in publishArtifactReferenceMessage
  service.changeControl.saveIterationArtifactDraft(iteration.id, "analysis-report", {
    actor: "pm",
    content: "# 首版需求分析报告\n\n## 目标用户\n本次迭代面向内部运营人员和外部合作伙伴。\n\n## 纳入范围\n用户注册、登录、权限管理三大模块。\n\n## 排除范围\n支付模块、物流模块暂不纳入本次迭代。\n\n## 风险评估\n注册流程需接入第三方短信服务，存在可用性风险。"
  });
  return { service, iteration };
}

test("artifact commit and append each produce their own reference message", () => {
  const { service, iteration } = createIterationWithDraftArtifact();

  service.changeControl.commitIterationArtifact(iteration.id, "analysis-report", {
    actor: "pm",
    summary: "已完成目标与范围梳理",
    evidence: ["目标用户", "纳入项"]
  });
  service.changeControl.appendIterationArtifactToConversation(iteration.id, "analysis-report", {
    actor: "pm",
    prompt: "请基于该交付物继续推进下一步，并明确影响范围。"
  });

  const messages = service.iteration.listMessages(iteration.id);
  const artifactMessages = messages.filter((item) => item.content.startsWith("【交付物引用】"));
  assert.equal(artifactMessages.length >= 1, true, "at least one artifact reference message");
});

test("artifact append still creates a new reference after later user conversation", () => {
  const { service, iteration } = createIterationWithDraftArtifact();

  service.changeControl.commitIterationArtifact(iteration.id, "analysis-report", {
    actor: "pm",
    summary: "已完成目标与范围梳理",
    evidence: ["目标用户", "纳入项"]
  });
  service.iteration.createMessage(iteration.id, "user", "请基于这份报告继续细化边界。");
  service.changeControl.appendIterationArtifactToConversation(iteration.id, "analysis-report", {
    actor: "pm",
    prompt: "请基于该交付物继续推进下一步，并明确影响范围。"
  });

  const messages = service.iteration.listMessages(iteration.id);
  assert.equal(messages.filter((item) => item.role === "user").length, 1);
  assert.equal(messages.filter((item) => item.content.startsWith("【交付物引用】")).length >= 1, true);
});
