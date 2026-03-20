#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildArtifactSummary,
  isMeaningfulArtifactContent,
  normalizeArtifactContent
} from "./creativeGeneratorArtifactQuality.mjs";

const BASE = process.env.BUILDWISE_API_BASE || "http://127.0.0.1:5055";
const ACTOR = process.env.BUILDWISE_DEMO_ACTOR || "creative-generator-demo";
const NOW = new Date();
function loadEnvFile() {
  try {
    const envPath = resolve(process.cwd(), "backend/.env");
    const envText = readFileSync(envPath, "utf-8");
    const env = {};
    for (const line of envText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      env[key.trim()] = rest.join("=").trim();
    }
    return env;
  } catch { return {}; }
}
const BACKEND_ENV = loadEnvFile();
const LLM_API_BASE = process.env.LLM_API_BASE || BACKEND_ENV.LLM_API_BASE || "https://api.minimaxi.com/anthropic";
const LLM_API_KEY = process.env.LLM_API_KEY || BACKEND_ENV.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || BACKEND_ENV.LLM_MODEL || "MiniMax-M2.5";
const DIRECT_LLM_ARTIFACTS = new Set([
  "analysis-report", "product-requirements-doc", "boundary-confirmation",
  "prototype-preview", "design-spec", "technical-architecture",
  "api-specification", "database-design", "frontend-code", "backend-code",
  "test-matrix", "acceptance-checklist", "release-review", "deployment-plan", "delivery-package"
]);
const STAMP = NOW.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const REQUIREMENT_PATH = resolve(process.cwd(), "docs/creative-generator-demo-requirement.md");
const REQUIREMENT_MARKDOWN = readFileSync(REQUIREMENT_PATH, "utf-8");
const PROJECT_NAME = "创意生成器演示项目";
const V1_NAME = "V1 首版本：创意生成器 MVP";
const V11_NAME = "V1.1 后续版本：业务规则注入与历史筛选";
const FORCE_ARTIFACTS = new Set(
  String(process.env.BUILDWISE_FORCE_ARTIFACTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const FORCE_ITERATION_IDS = new Set(
  String(process.env.BUILDWISE_FORCE_ITERATION_IDS || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
);

const ARTIFACT_UPSTREAM_DEPS = {
  "analysis-report": [],
  "product-requirements-doc": ["analysis-report"],
  "boundary-confirmation": ["analysis-report", "product-requirements-doc"],
  "prototype-preview": ["product-requirements-doc", "boundary-confirmation"],
  "design-spec": ["product-requirements-doc", "boundary-confirmation", "prototype-preview"],
  "technical-architecture": ["product-requirements-doc", "boundary-confirmation", "design-spec"],
  "api-specification": ["technical-architecture", "product-requirements-doc"],
  "database-design": ["technical-architecture", "api-specification"],
  "frontend-code": ["technical-architecture", "design-spec", "prototype-preview", "api-specification"],
  "backend-code": ["technical-architecture", "api-specification", "database-design"],
  "test-matrix": ["product-requirements-doc", "api-specification", "frontend-code", "backend-code"],
  "acceptance-checklist": ["product-requirements-doc", "test-matrix"],
  "release-review": ["acceptance-checklist", "test-matrix", "frontend-code", "backend-code"],
  "deployment-plan": ["technical-architecture", "frontend-code", "backend-code", "release-review"],
  "delivery-package": ["release-review", "deployment-plan", "acceptance-checklist"]
};

function buildUpstreamContextForScript(artifactId, artifacts) {
  const deps = ARTIFACT_UPSTREAM_DEPS[artifactId] || [];
  if (deps.length === 0) return "";
  const committed = artifacts.filter((a) => deps.includes(a.id) && Number(a.outputVersion || 0) > 0);
  if (committed.length === 0) return "";
  const perDepBudget = committed.length >= 6 ? 220 : Math.min(4000, Math.max(800, Math.floor(8000 / committed.length)));
  const sections = committed.map((a) => {
    const content = a.draft?.content || a.summary || "";
    const excerpt = content.slice(0, perDepBudget);
    return `### 上游交付物：${a.title}\n${excerpt}`;
  });
  return "--- 已确认的上游交付物内容（请基于此确保本交付物与上游保持一致、层层递进）---\n\n" + sections.join("\n\n");
}

const V1_STEPS = [
  ["analysis-report", "我要做一个创意生成器，请输出首版需求分析报告。使用 Markdown 标题分节，必须完整包含：目标用户、问题定义、核心场景、本轮纳入项、本轮排除项、交互原则、关键风险、待确认点。不要只给摘要或待处理提示。"],
  ["product-requirements-doc", "继续输出产品需求文档，使用 Markdown，至少包含问题定义、用户场景、功能需求、非功能要求、排除项、验收标准。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["boundary-confirmation", "继续输出边界确认，说明 in-scope、out-of-scope、关键约束、验收口径和 codePath 边界。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["prototype-preview", "继续输出原型交付物。保持正常对话回复，但正文必须包含一份完整可渲染的 HTML 原型，覆盖主题输入、创意结果列表、收藏和右侧详情抽屉。"],
  ["design-spec", "继续输出设计规范，使用 Markdown，至少包含布局规则、颜色/字体、状态样式、交互反馈和响应式约束。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["technical-architecture", "继续输出技术架构说明，使用 Markdown，至少包含模块职责、数据流、接口边界、依赖、失败处理和回滚点。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["api-specification", "继续输出接口设计文档，使用 Markdown，必须包含：每个 API 的路径、HTTP 方法、请求参数结构、响应结构、错误码定义、鉴权方式。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["database-design", "继续输出数据模型设计，使用 Markdown。即使首版采用前端主导架构，也必须设计完整的服务端数据库方案（后续版本会迁移到服务端存储）。必须包含：ER 关系描述（实体间关联）、核心数据表结构（表名、字段名、字段类型、约束条件）、索引策略（主键索引、查询优化索引）、数据迁移方案（从本地存储到服务端的迁移路径）。至少设计 3 张以上数据表。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["frontend-code", "继续输出前端代码交付物。正文必须包含完整的 TypeScript/React 代码，覆盖创意生成器的组件结构、路由、状态管理和 API 调用层。"],
  ["backend-code", "继续输出后端代码交付物。正文必须包含完整的后端代码（TypeScript/Node.js），覆盖 API 路由定义、服务层业务逻辑、数据访问层和中间件。"],
  ["test-matrix", "继续输出测试矩阵，使用 Markdown 表格或列表，覆盖主题输入、生成结果、收藏、详情抽屉、API 接口、数据库操作、回归点。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["acceptance-checklist", "继续输出验收清单，使用 Markdown，列出业务验收口径、发布前检查项和必须人工确认的点。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["release-review", "继续输出发布评审，使用 Markdown，至少包含发布结论、阻断项、上线前置条件、回滚策略。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["deployment-plan", "继续输出部署方案，使用 Markdown，必须包含：环境配置清单、上线步骤、回滚流程、健康检查配置、监控告警策略。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["delivery-package", "继续输出交付归档，使用 Markdown，至少包含本版基线、已确认交付物清单（15 项）、遗留问题、下版本继承输入。直接输出完整正文，不要给流程说明或待处理摘要。"]
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
  ["analysis-report", "我已完成 V1 基线，请输出继承差异分析报告。使用 Markdown 标题分节，必须完整包含：继承不变项、本轮新增项、业务规则变化、影响范围、受影响工程对象、回归关注点、待确认点。不要只给摘要或待处理提示。"],
  ["product-requirements-doc", "继续输出 V1.1 增量 PRD，使用 Markdown，重点补充业务规则注入、禁用词规则、历史记录筛选和验收标准。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["boundary-confirmation", "继续输出 V1.1 边界确认，明确继承不变项、增量 in-scope/out-of-scope、规则注入约束、代码边界。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["prototype-preview", "继续输出 V1.1 原型交付物。保持正常对话回复，但正文必须包含一份完整可渲染的 HTML 原型，体现业务规则输入区、规则命中标签和历史筛选。"],
  ["design-spec", "继续输出 V1.1 设计规范，使用 Markdown，说明规则输入区、状态反馈、标签筛选、命中提示和响应式规则。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["technical-architecture", "继续输出 V1.1 技术架构说明，使用 Markdown，明确业务规则如何从自然语言链接到工程对象、接口、状态和测试。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["api-specification", "继续输出 V1.1 接口设计文档，使用 Markdown，必须包含业务规则相关的新增/修改 API 路径、请求参数、响应结构、错误码。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["database-design", "继续输出 V1.1 数据模型设计，使用 Markdown，必须包含业务规则存储表结构、规则命中记录表、索引策略和迁移方案。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["frontend-code", "继续输出 V1.1 前端代码交付物。正文必须包含完整的 TypeScript/React 代码，体现业务规则输入区、规则命中标签和历史筛选功能。"],
  ["backend-code", "继续输出 V1.1 后端代码交付物。正文必须包含完整的后端代码，体现业务规则存储、规则匹配引擎和历史筛选 API。"],
  ["test-matrix", "继续输出 V1.1 测试矩阵，覆盖业务规则输入、禁用词校验、命中提示、历史筛选、API 接口测试和 V1 主路径回归。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["acceptance-checklist", "继续输出 V1.1 验收清单，重点包含业务规则正确映射、规则回归、人工确认点。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["release-review", "继续输出 V1.1 发布评审，使用 Markdown，包含发布结论、规则注入风险、回滚策略和观察点。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["deployment-plan", "继续输出 V1.1 部署方案，使用 Markdown，必须包含增量部署步骤、数据库迁移脚本执行、业务规则配置同步、回滚流程。直接输出完整正文，不要给流程说明或待处理摘要。"],
  ["delivery-package", "继续输出 V1.1 交付归档，使用 Markdown，说明新增业务规则基线、已确认交付物清单（15 项）、遗留问题、V1.2 继承输入。直接输出完整正文，不要给流程说明或待处理摘要。"]
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
  const status = await assertOk("status", () => requestJson("/api/v1/status", {}, 30000));
  const llm = status?.runtime?.llm;
  if (!llm?.configured || !String(llm?.model || "").trim()) {
    throw new Error(`llm runtime not ready: ${JSON.stringify(llm)}`);
  }
  return llm;
}

async function resolveProjectAndIterations() {
  const projects = await assertOk("listProjects", () => requestJson("/api/v1/projects"));
  const project = Array.isArray(projects) ? projects.find((item) => item?.name === PROJECT_NAME) : null;
  if (!project?.id) {
    throw new Error(`missing demo project: ${PROJECT_NAME}`);
  }
  const iterations = await assertOk("listIterations", () => requestJson(`/api/v1/projects/${project.id}/iterations`));
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
    requestJson(`/api/v1/iterations/${iterationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ role, content })
    })
  );
}

async function coachIteration(iterationId, message) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await requestJson(
      `/api/v1/iterations/${iterationId}/agent-chat`,
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

async function directLlmGenerate(prompt, maxTokens = 8000) {
  const apiKey = LLM_API_KEY || (await ensureLlmReady()).apiKey || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const response = await fetch(`${LLM_API_BASE}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: LLM_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal
    });
    const data = await response.json();
    const blocks = Array.isArray(data.content) ? data.content : [];
    const textBlock = blocks.find((b) => b.type === "text") || blocks[0];
    return textBlock?.text || "";
  } finally {
    clearTimeout(timer);
  }
}

async function saveDraft(iterationId, artifactId, content) {
  return assertOk(`saveDraft:${artifactId}`, () =>
    requestJson(`/api/v1/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/draft`, {
      method: "POST",
      body: JSON.stringify({ content, actor: ACTOR })
    })
  );
}

async function commitArtifact(iterationId, artifactId, summary, evidence = []) {
  return assertOk(`commitArtifact:${artifactId}`, () =>
    requestJson(`/api/v1/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/commit`, {
      method: "POST",
      body: JSON.stringify({ actor: ACTOR, summary, evidence, source: "creative-generator-demo-setup" })
    })
  );
}

async function appendArtifact(iterationId, artifactId, prompt) {
  return assertOk(`appendArtifact:${artifactId}`, () =>
    requestJson(`/api/v1/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/add-to-chat`, {
      method: "POST",
      body: JSON.stringify({ actor: ACTOR, prompt })
    })
  );
}

async function listArtifacts(iterationId) {
  const workflow = await assertOk("listArtifacts", () => requestJson(`/api/v1/iterations/${iterationId}/change-control/artifacts`));
  return Array.isArray(workflow?.items) ? workflow.items : [];
}

async function listMessages(iterationId) {
  const messages = await assertOk("listMessages", () => requestJson(`/api/v1/iterations/${iterationId}/messages`));
  return Array.isArray(messages) ? messages : [];
}

async function assertNoUserArtifactReferenceMessages(iterationId) {
  const messages = await listMessages(iterationId);
  const invalid = messages.filter((item) => item?.role === "user" && String(item?.content || "").trim().startsWith("【交付物引用】"));
  if (invalid.length > 0) {
    throw new Error(`iteration ${iterationId} contains user artifact reference echoes: ${invalid.map((item) => item.id).join(",")}`);
  }
}

function shouldSeedConversation(artifacts) {
  return !artifacts.some((item) => Number(item?.outputVersion || 0) > 0);
}

function selectPendingSteps(iterationId, steps, artifacts) {
  const completed = new Set(
    artifacts.filter((item) => Number(item?.outputVersion || 0) > 0).map((item) => item.id)
  );
  return steps.filter(([artifactId]) => {
    const forcedArtifact = FORCE_ARTIFACTS.has(artifactId);
    const forcedIteration = FORCE_ITERATION_IDS.size === 0 || FORCE_ITERATION_IDS.has(iterationId);
    return (forcedArtifact && forcedIteration) || !completed.has(artifactId);
  });
}

function looksIncomplete(text) {
  const trimmed = text.trimEnd();
  if (/```[a-z]*\s*$/i.test(trimmed)) return true;
  const openFences = (trimmed.match(/```/g) || []).length;
  if (openFences % 2 !== 0) return true;
  if (/<(html|body|div|section|table|ul|ol|pre|code)\b/i.test(trimmed)) {
    const lastTag = trimmed.match(/<\/?(html|body|div|section|table|ul|ol|pre|code)\b[^>]*>\s*$/i);
    if (!lastTag) return true;
  }
  if (/[，、：；。]$/.test(trimmed)) return false;
  if (/[,;:]$/.test(trimmed) && !/```$/.test(trimmed)) return true;
  return false;
}

async function continueContent(iterationId, artifactId, previousContent) {
  const MAX_CONTINUATIONS = 3;
  let fullContent = previousContent;
  for (let i = 0; i < MAX_CONTINUATIONS; i += 1) {
    if (!looksIncomplete(fullContent)) break;
    const continuePrompt = `交付物「${artifactId}」的上一段输出似乎被截断了，请从断点处继续输出后续内容，不要重复已输出的部分。上一段末尾为：\n\n…${fullContent.slice(-300)}`;
    const response = await coachIteration(iterationId, continuePrompt);
    const chunk = normalizeArtifactContent(response.reply);
    if (!chunk || chunk.length < 20) break;
    fullContent = fullContent + "\n" + chunk;
  }
  return fullContent;
}

async function dismissGitIntake(iterationId) {
  const probe = await coachIteration(iterationId, "暂不读取仓库");
  if (probe?.llm?.reason === "git-intake-waiting-confirmation" || probe?.llm?.reason === "git-intake-declined-branch") {
    await coachIteration(iterationId, "暂不读取仓库");
  }
}

async function generateIteration(iteration, seedConversation, steps, artifactPromptSuffix) {
  const existingArtifacts = await listArtifacts(iteration.id);
  if (shouldSeedConversation(existingArtifacts)) {
    await dismissGitIntake(iteration.id);
    for (const message of seedConversation) {
      await createMessage(iteration.id, message.role, message.content);
    }
  }
  const pendingSteps = selectPendingSteps(iteration.id, steps, existingArtifacts);
  const traces = [];
  for (const [artifactId, userMessage] of pendingSteps) {
    const currentArtifacts = await listArtifacts(iteration.id);
    const upstreamContext = buildUpstreamContextForScript(artifactId, currentArtifacts);
    const forceRewrite = FORCE_ARTIFACTS.has(artifactId) && (FORCE_ITERATION_IDS.size === 0 || FORCE_ITERATION_IDS.has(iteration.id));
    const baseMessage = forceRewrite
      ? `这是用于流程验证的交付物重建，不是阶段推进。请忽略当前迭代所处阶段，直接输出交付物「${artifactId}」的完整正文，不要只回复摘要、待处理点或流程说明。\n\n${userMessage}`
      : userMessage;
    const effectiveMessage = upstreamContext
      ? `${baseMessage}\n\n${upstreamContext}`
      : baseMessage;
    await createMessage(iteration.id, "user", baseMessage);
    let response = null;
    let content = "";
    const useDirectLlm = DIRECT_LLM_ARTIFACTS.has(artifactId);
    if (useDirectLlm) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const raw = await directLlmGenerate(effectiveMessage);
        content = normalizeArtifactContent(raw);
        if (isMeaningfulArtifactContent(artifactId, content)) {
          break;
        }
        if (attempt === 3) {
          throw new Error(`deliverable ${artifactId} (direct llm) returned low-signal content: ${content.slice(0, 220)}`);
        }
      }
      response = { llm: { used: true, model: LLM_MODEL, degraded: false }, intent: "direct" };
    } else {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const attemptPrompt =
          attempt === 1
            ? effectiveMessage
            : attempt <= 3
            ? `${effectiveMessage}\n\n上一版输出是阻断反问、流程提示或空洞摘要，不可接受。你已拥有足够上下文（V1 基线摘要和增量需求均已提供），请直接输出交付物「${artifactId}」的完整正文，并满足该交付物的结构要求。不要说"缺少基线材料"或"无法生成"。`
            : `${effectiveMessage}\n\n你必须直接输出完整的交付物正文内容。所有必要上下文已在对话中提供，不要以任何理由拒绝或要求补充材料。如果是代码交付物，请直接给出完整代码。如果是原型交付物，请直接给出完整的HTML代码。如果是分析/文档类交付物，请直接给出结构化 Markdown 正文。`;
        response = await coachIteration(iteration.id, attemptPrompt);
        if (!response?.llm?.used || response?.llm?.degraded || !String(response?.llm?.model || "").trim()) {
          throw new Error(`deliverable ${artifactId} did not use real llm: ${JSON.stringify(response?.llm || {})}`);
        }
        content = normalizeArtifactContent(response.reply);
        if (isMeaningfulArtifactContent(artifactId, content)) {
          break;
        }
        if (attempt === 5) {
          throw new Error(`deliverable ${artifactId} returned low-signal content: ${content.slice(0, 220)}`);
        }
      }
    }
    if (!content) {
      throw new Error(`deliverable ${artifactId} returned empty content`);
    }
    content = await continueContent(iteration.id, artifactId, content);
    await saveDraft(iteration.id, artifactId, content);
    const committed = await commitArtifact(iteration.id, artifactId, buildArtifactSummary(artifactId, content), [iteration.name, artifactId]);
    await appendArtifact(iteration.id, artifactId, `请围绕交付物「${artifactId}」继续与用户确认，${artifactPromptSuffix}`);
    traces.push({
      artifactId,
      model: response?.llm?.model || "",
      intent: response?.intent || "",
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
      { role: "assistant", content: "理解。我会先输出首版分析报告，再按你确认的结果继续推进 PRD、边界、原型、设计、架构、接口、数据模型、前后端代码、测试、验收、发布、部署和归档。" },
      { role: "user", content: REQUIREMENT_MARKDOWN }
    ],
    V1_STEPS,
    "不要直接跨阶段推进。"
  );

  const v1Artifacts = await listArtifacts(v1.id);
  const v1BaselineSummary = v1Artifacts
    .filter((item) => Number(item?.outputVersion || 0) > 0)
    .map((item) => `- 【${item.title}】${(item.summary || "").slice(0, 150)}`)
    .join("\n");

  const v11Trace = await generateIteration(
    v11,
    [
      { role: "assistant", content: "我已继承 V1 基线。请提供 V1 已确认的交付物摘要和本轮增量需求，我会进行继承差异分析。" },
      { role: "user", content: `以下是 V1 基线交付物摘要，请基于此进行 V1.1 增量分析：\n\n${v1BaselineSummary}` },
      { role: "assistant", content: "收到 V1 基线摘要，已确认 V1 包含需求分析、PRD、边界确认、原型、设计规范、技术架构、接口设计、数据模型、前端代码、后端代码、测试矩阵、验收清单、发布评审、部署方案和交付归档共 15 项交付物。请提供 V1.1 增量需求。" },
      { role: "user", content: "V1.1 需要支持业务人员通过自然语言灌入品牌语气规则和禁用词规则，并增加历史记录筛选。" },
      { role: "assistant", content: "收到。我会基于 V1 基线，先输出继承差异分析，再将业务规则关联到页面、组件、接口、状态和测试。" },
      { role: "user", content: V11_REQUIREMENT }
    ],
    V11_STEPS,
    "优先确认业务规则与工程对象的关联，再决定是否继续推进。"
  );

  const artifactsV1 = await listArtifacts(v1.id);
  const artifactsV11 = await listArtifacts(v11.id);
  await assertNoUserArtifactReferenceMessages(v1.id);
  await assertNoUserArtifactReferenceMessages(v11.id);
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
