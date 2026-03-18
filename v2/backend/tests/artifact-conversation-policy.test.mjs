import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const { WorkspaceService } = await import("../dist/application/workspace/workspaceService.js");
const { JsonWorkspaceRepository } = await import("../dist/infrastructure/persistence/jsonWorkspaceRepository.js");

function createWorkspaceService() {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-artifact-chat-"));
  const dataFile = path.join(fixtureDir, "workspace.json");
  writeFileSync(
    dataFile,
    JSON.stringify(
      {
        projects: [],
        iterations: [],
        messages: [],
        snapshots: [],
        transitions: [],
        auditLogs: [],
        versionSnapshots: [],
        projectShares: [],
        deployments: [],
        templateRuns: [],
        opsTriageTemplates: [],
        projectPolicies: [],
        projectWorkspaceBindings: [],
        policyExecutionLogs: [],
        projectRoleBindings: [],
        platformRoleBindings: [],
        governanceCustomRoles: []
      },
      null,
      2
    ),
    "utf-8"
  );
  const repository = new JsonWorkspaceRepository(dataFile);
  return new WorkspaceService(repository, null);
}

function createIterationWithDraftArtifact() {
  const service = createWorkspaceService();
  const project = service.createProject({
    name: "Artifact Conversation Project",
    description: "artifact conversation policy"
  });
  const iteration = service.createIteration(project.id, {
    name: "V1",
    description: "测试交付物会话策略"
  });
  service.saveIterationArtifactDraft(iteration.id, "analysis-report", {
    actor: "pm",
    content: "# 首版需求分析报告\n\n已完成目标用户、纳入范围与排除范围梳理。"
  });
  return { service, iteration };
}

test("artifact commit and append each produce their own reference message", () => {
  const { service, iteration } = createIterationWithDraftArtifact();

  service.commitIterationArtifact(iteration.id, "analysis-report", {
    actor: "pm",
    summary: "已完成目标与范围梳理",
    evidence: ["目标用户", "纳入项"]
  });
  service.appendIterationArtifactToConversation(iteration.id, "analysis-report", {
    actor: "pm",
    prompt: "请基于该交付物继续推进下一步，并明确影响范围。"
  });

  const messages = service.listMessages(iteration.id);
  const artifactMessages = messages.filter((item) => item.content.startsWith("【交付物引用】"));
  assert.equal(artifactMessages.length, 2);
  assert.match(artifactMessages[0]?.content || "", /【交付物引用】首版需求分析报告/);
});

test("artifact append still creates a new reference after later user conversation", () => {
  const { service, iteration } = createIterationWithDraftArtifact();

  service.commitIterationArtifact(iteration.id, "analysis-report", {
    actor: "pm",
    summary: "已完成目标与范围梳理",
    evidence: ["目标用户", "纳入项"]
  });
  service.createMessage(iteration.id, "user", "请基于这份报告继续细化边界。");
  service.appendIterationArtifactToConversation(iteration.id, "analysis-report", {
    actor: "pm",
    prompt: "请基于该交付物继续推进下一步，并明确影响范围。"
  });

  const messages = service.listMessages(iteration.id);
  assert.equal(messages.filter((item) => item.role === "user").length, 1);
  assert.equal(messages.filter((item) => item.content.startsWith("【交付物引用】")).length, 2);
});
