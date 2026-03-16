#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.env.BUILDWISE_API_BASE || "http://127.0.0.1:5055";
const TARGET_PROJECT_ID = Number.parseInt(process.env.BUILDWISE_PROJECT_ID || "", 10);
const TARGET_ITERATION_ID = Number.parseInt(process.env.BUILDWISE_ITERATION_ID || "", 10);
const ACTOR = process.env.BUILDWISE_DEMO_ACTOR || "openclaw-real-demo";
const NOW = new Date();
const STAMP = NOW.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

async function requestJson(path, options = {}, timeoutMs = 120000) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function assertOk(label, fn) {
  const result = await fn();
  if (!result.ok) {
    throw new Error(`${label} failed: status=${result.status} body=${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function resolveTargetIteration() {
  if (Number.isFinite(TARGET_ITERATION_ID) && TARGET_ITERATION_ID > 0) {
    return TARGET_ITERATION_ID;
  }
  const projects = await assertOk("listProjects", () => requestJson("/api/projects"));
  const projectList = Array.isArray(projects) ? projects : [];
  const targetProject =
    (Number.isFinite(TARGET_PROJECT_ID) && TARGET_PROJECT_ID > 0
      ? projectList.find((item) => Number(item?.id) === TARGET_PROJECT_ID)
      : null) || projectList[0];
  if (!targetProject?.id) {
    throw new Error("no project found; please seed data first");
  }
  const iterations = await assertOk("listIterations", () => requestJson(`/api/projects/${targetProject.id}/iterations`));
  const iterationList = Array.isArray(iterations) ? iterations : [];
  const target = iterationList.find((item) => item?.current) || iterationList[iterationList.length - 1];
  if (!target?.id) {
    throw new Error(`project ${targetProject.id} has no iteration; please seed data first`);
  }
  return Number(target.id);
}

async function assertLlmReady() {
  const status = await assertOk("status", () => requestJson("/api/status", undefined, 30000));
  const llm = status?.runtime?.llm;
  const configured = Boolean(llm?.configured);
  const reachable = Boolean(llm?.reachable);
  if (!configured || !reachable) {
    throw new Error(
      `llm runtime not ready: configured=${configured} reachable=${reachable} error=${llm?.error || "unknown"}`
    );
  }
  return { model: llm?.model || "", baseUrl: llm?.baseUrl || "" };
}

async function createMessage(iterationId, role, content) {
  await assertOk(`createMessage:${role}`, () =>
    requestJson(`/api/iterations/${iterationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ role, content })
    })
  );
}

async function appendArtifactToChat(iterationId, artifactId, prompt) {
  await assertOk(`appendArtifact:${artifactId}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/add-to-chat`, {
      method: "POST",
      body: JSON.stringify({ actor: ACTOR, prompt })
    })
  );
}

async function runCoachStep(iterationId, step) {
  await createMessage(iterationId, "user", step.userMessage);
  const response = await assertOk(`agentChat:${step.name}`, () =>
    requestJson(`/api/iterations/${iterationId}/agent-chat`, {
      method: "POST",
      body: JSON.stringify({ message: step.userMessage })
    })
  );
  if (!response?.llm?.used || response?.llm?.degraded || !String(response?.llm?.model || "").trim()) {
    throw new Error(
      `step ${step.name} did not use real llm: used=${response?.llm?.used} degraded=${response?.llm?.degraded} model=${response?.llm?.model || ""}`
    );
  }
  await createMessage(iterationId, "assistant", response.reply || "");
  return response;
}

async function main() {
  const llm = await assertLlmReady();
  const iterationId = await resolveTargetIteration();
  const steps = [
    {
      name: "clarification",
      artifactId: "analysis-report",
      artifactPrompt: "请基于该分析报告先收敛继承差异，再给出本轮首个关键动作。",
      userMessage: "我们开始本轮推进，请先做继承差异确认并给出最小可执行下一步。"
    },
    {
      name: "boundary",
      artifactId: "boundary-confirmation",
      artifactPrompt: "请引用边界确认结果，明确 inScope/outOfScope 与 codePath 约束。",
      userMessage: "继续，请把边界与约束明确到可执行级别。"
    },
    {
      name: "development",
      artifactId: "code-delivery",
      artifactPrompt: "请结合代码交付条目，给出本轮实现与验证最短路径。",
      userMessage: "继续推进到实现阶段，给我一个今天能执行的交付路径。"
    },
    {
      name: "testing",
      artifactId: "test-matrix",
      artifactPrompt: "请基于测试矩阵指出当前阻断项与回归优先级。",
      userMessage: "现在进入测试视角，先处理阻断项。"
    },
    {
      name: "release",
      artifactId: "release-review",
      artifactPrompt: "请基于发布评审条目给出 go/caution/block 结论及下一步动作。",
      userMessage: "准备发布评审，请给结论和最小风险推进方案。"
    }
  ];

  const trace = [];
  for (const step of steps) {
    await appendArtifactToChat(iterationId, step.artifactId, step.artifactPrompt);
    const result = await runCoachStep(iterationId, step);
    trace.push({
      step: step.name,
      intent: result.intent,
      llm: result.llm,
      replyPreview: String(result.reply || "").slice(0, 240)
    });
  }

  const outDir = resolve(process.cwd(), ".artifacts");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `openclaw-real-llm-demo-${STAMP}.json`);
  const payload = {
    ok: true,
    apiBase: BASE,
    actor: ACTOR,
    at: NOW.toISOString(),
    iterationId,
    runtimeLlm: llm,
    trace
  };
  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify({ ok: true, outFile, iterationId, steps: trace.length, model: llm.model }, null, 2));
}

main().catch((error) => {
  console.error(`[openclaw-real-llm-demo] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
