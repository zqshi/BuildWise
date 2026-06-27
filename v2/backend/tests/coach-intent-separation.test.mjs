import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, buildMinimalIteration } from "./helpers/mock-factories.mjs";

const { coachIterationConversationOp } = await import(
  "../dist/application/workspace/coach/coachOps.js"
);

// ─── T1: 迭代对话意图识别 + 运行/执行态分离 ───
//
// 现状缺陷：orchestrateCoachMessage 阶段驱动，processAgentResponse 后无条件
// attemptArtifactSynthesis + evaluateAndAdvanceStage。用户「询问/讨论」被当推进输入，
// 仍合成交付物、推进阶段——运行态（对话）与执行态（产交付物/推进）未分离。
//
// 本组测试断言：finalIntent ∈ {general, question}（纯对话态）时不推进阶段、不产交付物；
// 推进类 intent 仍正常推进（契约保护，不回归）。
//
// 构造：development 阶段，technical-architecture 已 ready+passed → 出口条件满足，
// 改动前 evaluateAndAdvanceStage 必推进到 testing；改动后纯对话态跳过，保持 development。
// technical-architecture gateStatus=passed 使 attemptArtifactSynthesis 的 artifactsToAttempt
// 为空提前 return（在 ensureStructuredRequirements 之前），副作用精确集中在阶段推进。

function setupDevelopmentIteration() {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({ id: 1, name: "P" });
  const now = new Date().toISOString();
  const iter = buildMinimalIteration(1, {
    id: 10,
    changeControl: {
      confirmedBy: "user",
      confirmedAt: now,
      artifactWorkflow: {
        activeStage: "development",
        updatedAt: now,
        items: [
          {
            id: "technical-architecture",
            stage: "development",
            status: "ready",
            gateStatus: "passed",
            outputVersion: 1,
            stale: false,
            title: "技术架构",
          },
        ],
      },
    },
  });
  repo._store.iterations.push(iter);
  return repo;
}

function mockRunnerReturning(intent) {
  return {
    async run() {
      return {
        content: `我来回应你的问题，先解释一下思路。\n<!-- coach:{"intent":"${intent}","execution":{"action":"none","instruction":"","apply":false,"artifacts":[]},"guidance":{}} -->`,
        model: "mock-intent",
      };
    },
    async runWithHistory() {
      return { content: "续", model: "mock-intent" };
    },
  };
}

test("用户询问类消息(intent=question)不推进阶段、不产交付物——纯对话态", async () => {
  const repo = setupDevelopmentIteration();
  const res = await coachIterationConversationOp(repo, mockRunnerReturning("question"), 10, "这个逻辑是怎么设计的？");
  const after = repo.findIteration(10).changeControl.artifactWorkflow.activeStage;

  assert.equal(after, "development", "询问类消息不应推进 activeStage");
  assert.equal(res.intent, "question", "intent 应保留为 question");
  assert.doesNotMatch(res.reply, /阶段已完成/, "纯对话回复不应含阶段推进提示");
  assert.doesNotMatch(res.reply, /已为你生成以下交付物/, "纯对话回复不应含交付物生成提示");
});

test("普通对话(intent=general)同样不推进阶段、不产交付物", async () => {
  const repo = setupDevelopmentIteration();
  const res = await coachIterationConversationOp(repo, mockRunnerReturning("general"), 10, "嗯，我理解了");
  const after = repo.findIteration(10).changeControl.artifactWorkflow.activeStage;

  assert.equal(after, "development", "普通对话不应推进 activeStage");
  assert.equal(res.intent, "general");
  assert.doesNotMatch(res.reply, /阶段已完成/, "纯对话回复不应含阶段推进提示");
  assert.doesNotMatch(res.reply, /已为你生成以下交付物/, "纯对话回复不应含交付物生成提示");
});

test("契约保护：推进类消息(intent=plan)仍正常推进阶段（不回归）", async () => {
  const repo = setupDevelopmentIteration();
  await coachIterationConversationOp(repo, mockRunnerReturning("plan"), 10, "我们继续推进技术方案");
  const after = repo.findIteration(10).changeControl.artifactWorkflow.activeStage;

  assert.equal(after, "testing", "推进类消息应正常推进到下一阶段");
});
