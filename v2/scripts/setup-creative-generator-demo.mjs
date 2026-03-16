#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const BASE = process.env.BUILDWISE_API_BASE || "http://127.0.0.1:5055";
const ACTOR = process.env.BUILDWISE_DEMO_ACTOR || "creative-generator-demo";
const NOW = new Date();
const STAMP = NOW.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const REQUIREMENT_PATH = resolve(process.cwd(), "docs/creative-generator-demo-requirement.md");
const REQUIREMENT_MARKDOWN = readFileSync(REQUIREMENT_PATH, "utf-8");
const PROJECT_NAME = "创意生成器演示项目";
const V1_NAME = "V1 首版本：创意生成器 MVP";
const V11_NAME = "V1.1 后续版本：业务规则注入与历史筛选";

const V1_STEPS = [
  ["analysis-report", "我要做一个创意生成器，请输出首版需求分析报告，明确目标用户、问题定义、纳入项、排除项、交互原则、待确认点。"],
  ["product-requirements-doc", "继续输出产品需求文档，使用 Markdown，至少包含问题定义、用户场景、功能需求、非功能要求、排除项、验收标准。"],
  ["boundary-confirmation", "继续输出边界确认，说明 in-scope、out-of-scope、关键约束、验收口径和 codePath 边界。"],
  ["prototype-preview", "继续输出原型交付物。保持正常对话回复，但正文必须包含一份完整可渲染的 HTML 原型，覆盖主题输入、创意结果列表、收藏和右侧详情抽屉。"],
  ["design-spec", "继续输出设计规范，使用 Markdown，至少包含布局规则、颜色/字体、状态样式、交互反馈和响应式约束。"],
  ["technical-architecture", "继续输出技术架构说明，使用 Markdown，至少包含模块职责、数据流、接口边界、依赖、失败处理和回滚点。"],
  ["code-delivery", "继续输出代码交付物。保持正常对话回复，但正文必须包含一段完整的 TypeScript/React 代码，用于创意生成器的主题输入与结果卡片列表。"],
  ["test-matrix", "继续输出测试矩阵，使用 Markdown 表格或列表，覆盖主题输入、生成结果、收藏、详情抽屉、回归点。"],
  ["acceptance-checklist", "继续输出验收清单，使用 Markdown，列出业务验收口径、发布前检查项和必须人工确认的点。"],
  ["release-review", "继续输出发布评审，使用 Markdown，至少包含发布结论、阻断项、上线前置条件、回滚策略。"],
  ["delivery-package", "继续输出交付归档，使用 Markdown，至少包含本版基线、已确认交付物、遗留问题、下版本继承输入。"]
];

const V11_REQUIREMENT = [
  "# 创意生成器 V1.1 增量需求",
  "",
  "## 增量目标",
  "在 V1 创意生成主路径不被破坏的前提下，新增“业务规则注入”能力，让业务人员通过自然语言补充品牌语气规则、禁用词规则，并增加历史记录筛选。",
  "",
  "## 本轮变化",
  "- 新增“品牌语气规则”自然语言输入区",
  "- 新增“禁用词规则”自然语言输入区",
  "- 创意结果需要标记命中的业务规则",
  "- 历史记录列表增加按规则标签筛选",
  "",
  "## 业务规则样例",
  "- 品牌语气：更专业、克制，不要夸张承诺",
  "- 禁用词：不要出现“最强”“必买”“唯一”",
  "- 目标受众：B 端营销团队与内容运营",
  "",
  "## 验收要求",
  "1. 业务人员不需要改代码就能通过自然语言输入规则",
  "2. 规则能关联到页面、组件、接口或测试",
  "3. 不破坏 V1 的主题输入、生成与收藏主流程"
].join("\n");

const V11_STEPS = [
  ["analysis-report", "我已完成 V1 基线，请输出继承差异分析报告，明确继承不变项、本轮新增项、业务规则变化、影响范围、待确认点。"],
  ["product-requirements-doc", "继续输出 V1.1 增量 PRD，使用 Markdown，重点补充业务规则注入、禁用词规则、历史记录筛选和验收标准。"],
  ["boundary-confirmation", "继续输出 V1.1 边界确认，明确继承不变项、增量 in-scope/out-of-scope、规则注入约束、代码边界。"],
  ["prototype-preview", "继续输出 V1.1 原型交付物。保持正常对话回复，但正文必须包含一份完整可渲染的 HTML 原型，体现业务规则输入区、规则命中标签和历史筛选。"],
  ["design-spec", "继续输出 V1.1 设计规范，使用 Markdown，说明规则输入区、状态反馈、标签筛选、命中提示和响应式规则。"],
  ["technical-architecture", "继续输出 V1.1 技术架构说明，使用 Markdown，明确业务规则如何从自然语言链接到工程对象、接口、状态和测试。"],
  ["code-delivery", "继续输出 V1.1 代码交付物。保持正常对话回复，但正文必须包含一段完整的 TypeScript/React 代码，体现业务规则输入、命中标签和历史筛选。"],
  ["test-matrix", "继续输出 V1.1 测试矩阵，覆盖业务规则输入、禁用词校验、命中提示、历史筛选和 V1 主路径回归。"],
  ["acceptance-checklist", "继续输出 V1.1 验收清单，重点包含业务规则正确映射、规则回归、人工确认点。"],
  ["release-review", "继续输出 V1.1 发布评审，使用 Markdown，包含发布结论、规则注入风险、回滚策略和观察点。"],
  ["delivery-package", "继续输出 V1.1 交付归档，使用 Markdown，说明新增业务规则基线、已确认交付物、遗留问题、V1.2 继承输入。"]
];

async function requestJson(path, options = {}, timeoutMs = 240000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { ok: response.ok, status: response.status, body };
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

async function ensureLlmReady() {
  const status = await assertOk("status", () => requestJson("/api/status", {}, 30000));
  const llm = status?.runtime?.llm;
  if (!llm?.configured || !String(llm?.model || "").trim()) {
    throw new Error(`llm runtime not ready: ${JSON.stringify(llm)}`);
  }
  return llm;
}

async function resolveProjectAndIterations() {
  const projects = await assertOk("listProjects", () => requestJson("/api/projects"));
  const project = Array.isArray(projects) ? projects.find((item) => item?.name === PROJECT_NAME) : null;
  if (!project?.id) {
    throw new Error(`missing demo project: ${PROJECT_NAME}`);
  }
  const iterations = await assertOk("listIterations", () => requestJson(`/api/projects/${project.id}/iterations`));
  const list = Array.isArray(iterations) ? iterations : [];
  const v1 = list.find((item) => item?.name === V1_NAME);
  const v11 = list.find((item) => item?.name === V11_NAME);
  if (!v1?.id || !v11?.id) {
    throw new Error("missing V1 or V1.1 scaffold iteration");
  }
  return { project, v1, v11 };
}

async function createMessage(iterationId, role, content) {
  return assertOk(`createMessage:${role}`, () =>
    requestJson(`/api/iterations/${iterationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ role, content })
    })
  );
}

async function coachIteration(iterationId, message) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await requestJson(
      `/api/iterations/${iterationId}/agent-chat`,
      { method: "POST", body: JSON.stringify({ message }) },
      240000
    );
    if (result.ok) {
      return result.body;
    }
    lastError = result;
    const text = `${result.status} ${JSON.stringify(result.body || {})}`;
    if (!/aborted|timeout|502|llm|missing reply|invalid payload/i.test(text) || attempt === 5) {
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 3000));
  }
  throw new Error(`agentChat failed: status=${lastError?.status} body=${JSON.stringify(lastError?.body)}`);
}

async function saveDraft(iterationId, artifactId, content) {
  return assertOk(`saveDraft:${artifactId}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/draft`, {
      method: "POST",
      body: JSON.stringify({ content, actor: ACTOR })
    })
  );
}

async function commitArtifact(iterationId, artifactId, summary, evidence = []) {
  return assertOk(`commitArtifact:${artifactId}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/commit`, {
      method: "POST",
      body: JSON.stringify({ actor: ACTOR, summary, evidence, source: "creative-generator-demo-setup" })
    })
  );
}

async function appendArtifact(iterationId, artifactId, prompt) {
  return assertOk(`appendArtifact:${artifactId}`, () =>
    requestJson(`/api/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/add-to-chat`, {
      method: "POST",
      body: JSON.stringify({ actor: ACTOR, prompt })
    })
  );
}

async function listArtifacts(iterationId) {
  const workflow = await assertOk("listArtifacts", () => requestJson(`/api/iterations/${iterationId}/change-control/artifacts`));
  return Array.isArray(workflow?.items) ? workflow.items : [];
}

function shouldSeedConversation(artifacts) {
  return !artifacts.some((item) => Number(item?.outputVersion || 0) > 0);
}

function selectPendingSteps(steps, artifacts) {
  const completed = new Set(
    artifacts.filter((item) => Number(item?.outputVersion || 0) > 0).map((item) => item.id)
  );
  return steps.filter(([artifactId]) => !completed.has(artifactId));
}

async function generateIteration(iteration, seedConversation, steps, artifactPromptSuffix) {
  const existingArtifacts = await listArtifacts(iteration.id);
  if (shouldSeedConversation(existingArtifacts)) {
    for (const message of seedConversation) {
      await createMessage(iteration.id, message.role, message.content);
    }
  }
  const pendingSteps = selectPendingSteps(steps, existingArtifacts);
  const traces = [];
  for (const [artifactId, userMessage] of pendingSteps) {
    await createMessage(iteration.id, "user", userMessage);
    const response = await coachIteration(iteration.id, userMessage);
    if (!response?.llm?.used || response?.llm?.degraded || !String(response?.llm?.model || "").trim()) {
      throw new Error(`deliverable ${artifactId} did not use real llm: ${JSON.stringify(response?.llm || {})}`);
    }
    const content = String(response.reply || "").trim();
    if (!content) {
      throw new Error(`deliverable ${artifactId} returned empty content`);
    }
    await createMessage(iteration.id, "assistant", content);
    await saveDraft(iteration.id, artifactId, content);
    const committed = await commitArtifact(iteration.id, artifactId, `${artifactId} 已生成，等待用户确认。`, [iteration.name, artifactId]);
    await appendArtifact(iteration.id, artifactId, `请围绕交付物「${artifactId}」继续与用户确认，${artifactPromptSuffix}`);
    traces.push({
      artifactId,
      model: response.llm.model,
      intent: response.intent || "",
      gateStatus: committed.gateStatus,
      outputVersion: committed.outputVersion,
      preview: content.slice(0, 220)
    });
  }
  return traces;
}

async function main() {
  const llm = await ensureLlmReady();
  const { project, v1, v11 } = await resolveProjectAndIterations();

  const v1Trace = await generateIteration(
    v1,
    [
      { role: "assistant", content: "这是首个版本，我会先建立创意生成器的业务基线，再逐步推进到发布归档。" },
      { role: "user", content: "我要做一个创意生成器，核心是输入主题后生成多组创意标题和卖点文案。" },
      { role: "assistant", content: "理解。我会先输出首版分析报告，再按你确认的结果继续推进 PRD、边界、原型、架构、代码、测试和发布。" },
      { role: "user", content: REQUIREMENT_MARKDOWN }
    ],
    V1_STEPS,
    "不要直接跨阶段推进。"
  );

  const v11Trace = await generateIteration(
    v11,
    [
      { role: "assistant", content: "我已继承 V1 基线。请直接说明本轮增量和业务规则，我会先做继承差异确认。" },
      { role: "user", content: "V1.1 需要支持业务人员通过自然语言灌入品牌语气规则和禁用词规则，并增加历史记录筛选。" },
      { role: "assistant", content: "收到。我会先输出继承差异分析，再将业务规则关联到页面、组件、接口、状态和测试。" },
      { role: "user", content: V11_REQUIREMENT }
    ],
    V11_STEPS,
    "优先确认业务规则与工程对象的关联，再决定是否继续推进。"
  );

  const artifactsV1 = await listArtifacts(v1.id);
  const artifactsV11 = await listArtifacts(v11.id);
  const outDir = resolve(process.cwd(), ".artifacts");
  mkdirSync(outDir, { recursive: true });
  const report = {
    ok: true,
    createdAt: NOW.toISOString(),
    apiBase: BASE,
    project: { id: project.id, name: project.name },
    iterations: [
      { id: v1.id, name: v1.name, version: v1.version, trace: v1Trace, artifacts: artifactsV1.map((item) => ({ id: item.id, title: item.title, gateStatus: item.gateStatus, outputVersion: item.outputVersion })) },
      { id: v11.id, name: v11.name, version: v11.version, trace: v11Trace, artifacts: artifactsV11.map((item) => ({ id: item.id, title: item.title, gateStatus: item.gateStatus, outputVersion: item.outputVersion })) }
    ],
    runtimeLlm: { model: llm.model, baseUrl: llm.baseUrl },
    requirementPath: REQUIREMENT_PATH,
    browserUseTarget: { url: "http://127.0.0.1:5173/app.html#/dashboard", loginPhone: "13800138000" }
  };
  const reportPath = join(outDir, `creative-generator-demo-setup-${STAMP}.json`);
  const latestPath = join(outDir, "creative-generator-demo-latest.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify({ ok: true, reportPath, latestPath, projectId: project.id, iterationIds: [v1.id, v11.id] }, null, 2));
}

main().catch((error) => {
  console.error(`[setup-creative-generator-demo] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
