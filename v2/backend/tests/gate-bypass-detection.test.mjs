import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, buildMinimalIteration, buildMinimalPolicyRecord } from "./helpers/mock-factories.mjs";

const { coachIterationConversationOp } = await import("../dist/application/workspace/coach/coachOps.js");

// mock agentRunner：run 返回带 coach marker 的推进 action（rewrite），触发门禁绕过检测
function createBypassMockRunner() {
  return {
    async run() {
      return {
        content: "我来帮你改代码。\n<!-- coach:{\"intent\":\"plan\",\"execution\":{\"action\":\"rewrite\",\"instruction\":\"改\",\"apply\":true},\"guidance\":{}} -->",
        model: "mock-bypass",
      };
    },
    async runWithHistory() {
      return { content: "ok", model: "mock-bypass" };
    },
  };
}

function setupBlockedPolicyGate() {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  // 迭代处于 development 阶段，technical-architecture ready 但未人工确认 → requireHumanConfirmation 阻断
  const now = new Date().toISOString();
  const iter = buildMinimalIteration(1, {
    id: 10,
    changeControl: {
      confirmedBy: "user",
      confirmedAt: now,
      artifactWorkflow: {
        activeStage: "development",
        items: [
          { id: "technical-architecture", stage: "development", status: "ready", lastConfirmedAt: "", lastConfirmedBy: "" },
        ],
      },
    },
  });
  repo._store.iterations.push(iter);
  // policy：development 阶段需人工确认（requireHumanConfirmation），但 artifact 未确认 → policyGate blocked
  const policy = buildMinimalPolicyRecord(1, {
    strategy: {
      stages: ["clarification", "scope", "development"],
      gates: [{ stage: "development", requiredArtifacts: [], requireHumanConfirmation: true }],
      requiredConfirmations: { firstIterationGitReport: false },
      exceptions: [],
      skillsPlan: [],
    },
  });
  repo._store.projectPolicies.push(policy);
  return repo;
}

test("policyGate 阻断 + LLM 声明 rewrite → 记录 gate_bypass_attempt 审计", async () => {
  const repo = setupBlockedPolicyGate();
  const runner = createBypassMockRunner();
  await coachIterationConversationOp(repo, runner, 10, "帮我改代码");
  const logs = repo.listPolicyExecutionLogs(10);
  const bypassLog = logs.find((l) => l.action === "gate_bypass_attempt");
  assert.ok(bypassLog, "应记录 gate_bypass_attempt 审计日志");
  assert.equal(bypassLog.result, "blocked");
  assert.ok(bypassLog.evidence.some((e) => e.includes("rewrite")), "审计证据应含 rewrite 动作");
});

test("policyGate 阻断 + LLM 声明 none → 不记录 gate_bypass_attempt", async () => {
  const repo = setupBlockedPolicyGate();
  const runner = {
    async run() {
      return {
        content: "当前还不能改代码，先确认一下。\n<!-- coach:{\"intent\":\"clarify\",\"execution\":{\"action\":\"none\",\"instruction\":\"\",\"apply\":false},\"guidance\":{}} -->",
        model: "mock",
      };
    },
    async runWithHistory() { return { content: "ok", model: "mock" }; },
  };
  await coachIterationConversationOp(repo, runner, 10, "帮我改代码");
  const logs = repo.listPolicyExecutionLogs(10);
  const bypassLog = logs.find((l) => l.action === "gate_bypass_attempt");
  assert.equal(bypassLog, undefined, "LLM 声明 none 时不应记录绕过审计");
});
