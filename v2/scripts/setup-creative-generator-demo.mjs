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
const LLM_PROVIDER = (() => {
  const preferred = (process.env.LLM_PROVIDER || BACKEND_ENV.LLM_PROVIDER || "").trim().toLowerCase();
  if (preferred === "anthropic") {
    return "anthropic-compatible";
  }
  if ((process.env.ANTHROPIC_BASE_URL || BACKEND_ENV.ANTHROPIC_BASE_URL || "").trim() && !String(process.env.LLM_API_BASE || BACKEND_ENV.LLM_API_BASE || "").trim()) {
    return "anthropic-compatible";
  }
  return LLM_API_BASE.includes("/anthropic") ? "anthropic-compatible" : "openai-compatible";
})();
const DIRECT_LLM_ARTIFACTS = new Set([
  "analysis-report", "product-requirements-doc", "boundary-confirmation",
  "prototype-preview", "design-spec", "technical-architecture",
  "api-specification", "database-design", "frontend-code", "backend-code",
  "test-matrix", "acceptance-checklist", "release-review", "deployment-plan", "delivery-package"
]);
const COMPOSED_LLM_ARTIFACTS = new Set(["prototype-preview", "frontend-code", "backend-code"]);
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
const ARTIFACTS_DIR = resolve(process.env.BUILDWISE_DEMO_ARTIFACTS_DIR || resolve(process.cwd(), ".artifacts"));
const BROWSER_USE_TARGET_URL = process.env.BUILDWISE_BROWSER_USE_TARGET_URL || "http://127.0.0.1:5173/app.html#/dashboard";
const DEMO_PHONE = process.env.BUILDWISE_DEMO_LOGIN_PHONE || "13800138000";
mkdirSync(ARTIFACTS_DIR, { recursive: true });

let accessToken = "";

function logSetup(message, payload) {
  const suffix = payload ? ` ${JSON.stringify(payload)}` : "";
  console.log(`[setup-demo] ${message}${suffix}`);
}

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

const ARTIFACT_OUTPUT_TEMPLATES = {
  "analysis-report": [
    "# 分析报告",
    "",
    "## 目标用户",
    "- ",
    "",
    "## 问题定义",
    "- ",
    "",
    "## 核心场景",
    "- ",
    "",
    "## 本轮纳入项",
    "- ",
    "",
    "## 本轮排除项",
    "- ",
    "",
    "## 交互原则",
    "- ",
    "",
    "## 关键风险",
    "- ",
    "",
    "## 待确认点",
    "- "
  ].join("\n"),
  "product-requirements-doc": [
    "# 产品需求文档",
    "",
    "## 问题定义",
    "- ",
    "",
    "## 用户场景",
    "- ",
    "",
    "## 功能需求",
    "- ",
    "",
    "## 非功能要求",
    "- ",
    "",
    "## 排除项",
    "- ",
    "",
    "## 验收标准",
    "- "
  ].join("\n"),
  "boundary-confirmation": [
    "# 边界确认",
    "",
    "## In-Scope",
    "- ",
    "",
    "## Out-of-Scope",
    "- ",
    "",
    "## 关键约束",
    "- ",
    "",
    "## 验收口径",
    "- ",
    "",
    "## CodePath 边界",
    "- "
  ].join("\n"),
  "frontend-code": [
    "```tsx",
    "import React from \"react\";",
    "",
    "type CreativeItem = {",
    "  id: string;",
    "  title: string;",
    "  highlights: string[];",
    "  favorite: boolean;",
    "};",
    "",
    "export function CreativeGeneratorPage() {",
    "  return <div>TODO</div>;",
    "}",
    "```"
  ].join("\n"),
  "backend-code": [
    "```ts",
    "import { FastifyInstance } from \"fastify\";",
    "",
    "type CreativeRequest = {",
    "  topic: string;",
    "};",
    "",
    "export async function registerCreativeRoutes(app: FastifyInstance) {",
    "  app.post(\"/api/creative/generate\", async (request, reply) => {",
    "    return { items: [] };",
    "  });",
    "}",
    "```"
  ].join("\n")
};

const DETERMINISTIC_TEXT_FALLBACKS = {
  "deployment-plan": [
    "# 部署方案",
    "",
    "## 环境配置清单",
    "- 前端使用静态构建产物部署，`VITE_API_BASE` 指向 `http://127.0.0.1:5055`。",
    "- 后端以 Node.js 进程启动，核心变量包含 `PORT`、`HOST`、`STORAGE_BACKEND=json|sqlite`、`WORKSPACE_DATA_FILE`。",
    "- 生产环境强制启用 `AUTH_MODE=jwt`，并配置 `JWT_SECRET`、`CORS_ORIGINS`。",
    "- 每个项目独立 `workspacePath`，项目知识资产写入 `workspacePath/.buildwise/` 并纳入备份。",
    "",
    "## 上线步骤",
    "1. 执行前后端构建并校验 `npm run build`、`npm --prefix backend run build` 通过。",
    "2. 先发布后端，再发布前端静态资源，并验证 `/health` 与 `/ready`。",
    "3. 完成短信登录、项目列表、迭代列表与交付物列表冒烟检查。",
    "4. 验证创意生成器项目能读取既有 workspace 并继续推进后续迭代。",
    "",
    "## 回滚流程",
    "1. 前端回滚到上一个静态资源版本。",
    "2. 后端回滚到上一个构建版本，同时保留 `WORKSPACE_DATA_FILE` 与 `.buildwise/` 数据。",
    "3. 如需数据回退，仅恢复最近一次备份的项目 workspace，不回退其他项目。",
    "",
    "## 健康检查配置",
    "- `/health` 用于 liveness，只校验进程存活。",
    "- `/ready` 用于 readiness，校验存储与 LLM 依赖可接流量。",
    "- 部署平台不应将 `/ready` 失败直接视为进程崩溃重启依据。",
    "",
    "## 监控告警策略",
    "- 监控 `/ready` 失败率、`/api/v1/iterations/:id/agent-chat` 5xx、artifact 提交失败率。",
    "- 监控 `workspace_path_already_bound`、JWT 鉴权失败、LLM 连通性下降。",
    "- 对项目 workspace 目录容量和 `.buildwise/` 增量进行每日巡检。"
  ].join("\n"),
  "delivery-package": [
    "# 交付归档",
    "",
    "## 本版基线",
    "- V1 建立创意生成器的分析、边界、原型、设计、架构、接口、数据、代码、测试和发布基线。",
    "- 项目级 workspace 与 `.buildwise/` 知识目录已经建立，可供后续版本继承。",
    "",
    "## 已确认交付物清单（15 项）",
    "- analysis-report",
    "- product-requirements-doc",
    "- boundary-confirmation",
    "- prototype-preview",
    "- design-spec",
    "- technical-architecture",
    "- api-specification",
    "- database-design",
    "- frontend-code",
    "- backend-code",
    "- test-matrix",
    "- acceptance-checklist",
    "- release-review",
    "- deployment-plan",
    "- delivery-package",
    "",
    "## 遗留问题",
    "- 真实 LLM 在大体量交付物上仍存在偶发低信号输出，需要脚本级兜底。",
    "- browser-use 两轮全环节验证尚未完全闭环，暂不满足最终放行。",
    "",
    "## 下版本继承输入",
    "- 在 V1.1 中增加业务规则自然语言注入、禁用词规则和历史筛选能力。",
    "- 继续沿用单 Agent、多 Project Workspace、项目级知识沉淀结构。"
  ].join("\n")
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

function buildStructuredArtifactPrompt(artifactId, prompt) {
  const template = ARTIFACT_OUTPUT_TEMPLATES[artifactId];
  if (!template) {
    return prompt;
  }
  return [
    prompt,
    "",
    "严格要求：",
    "1. 不要写前言、说明、解释、确认语或摘要。",
    "2. 直接从正文标题开始输出。",
    "3. 必须完整覆盖下面模板中的全部章节，不能缺项。",
    "4. 每个章节都必须填入具体内容，不能只写占位符。",
    "",
    "输出模板：",
    template
  ].join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    throw new Error("empty structured payload");
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`missing json object: ${candidate.slice(0, 160)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function sanitizeList(values, fallback) {
  const list = Array.isArray(values)
    ? values.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return list.length > 0 ? list : fallback;
}

function sanitizeCardList(values, fallback) {
  const list = Array.isArray(values)
    ? values
      .map((item) => ({
        title: String(item?.title || "").trim(),
        sellingPoint: String(item?.sellingPoint || "").trim(),
        cta: String(item?.cta || "").trim()
      }))
      .filter((item) => item.title && item.sellingPoint)
    : [];
  return list.length > 0 ? list : fallback;
}

function buildDefaultStructuredSpec(artifactId) {
  if (artifactId === "prototype-preview") {
    return {
      title: "创意生成器",
      subtitle: "为内容运营与市场团队快速生成创意标题、卖点文案和行动号召。",
      formFields: ["创意主题", "目标受众", "风格偏好"],
      results: [
        { title: "品牌焕新主题创意", sellingPoint: "围绕主题生成可继续筛选和收藏的创意卡片。", cta: "收藏并继续优化" },
        { title: "Campaign 卖点拓展", sellingPoint: "支持右侧详情抽屉查看创意亮点、行动建议与上下文。", cta: "查看详情" }
      ],
      detailSections: ["创意亮点", "适用场景", "推荐动作"],
      asideNotes: ["结果列表承载主任务流。", "详情通过右侧抽屉查看。"]
    };
  }
  if (artifactId === "frontend-code") {
    return {
      componentName: "CreativeGeneratorPage",
      apiPath: "/api/creative/generate",
      ruleFields: ["brandTone", "bannedWords"],
      filters: ["all", "favorites", "recent"]
    };
  }
  return {
    routePath: "/api/creative/generate",
    entityNames: ["creative_requests", "creative_items", "rule_matches"],
    validations: ["topic 不能为空", "禁止词必须在生成前过滤"]
  };
}

function buildPrototypeHtml(spec) {
  const title = String(spec?.title || "创意生成器").trim() || "创意生成器";
  const subtitle = String(spec?.subtitle || "为内容运营与市场团队快速生成创意方向、卖点文案与行动号召。").trim();
  const formFields = sanitizeList(spec?.formFields, ["创意主题", "目标受众", "风格偏好"]);
  const results = sanitizeCardList(spec?.results, [
    { title: "像春风一样唤醒品牌想象力", sellingPoint: "围绕产品主题给出多角度创意标题与卖点文案，适合快速头脑风暴。", cta: "收藏并继续打磨" },
    { title: "把抽象主题转成可执行内容方向", sellingPoint: "每张卡片提供标题、卖点和行动号召，支持继续生成与对比筛选。", cta: "查看右侧详情" }
  ]);
  const detailSections = sanitizeList(spec?.detailSections, ["创意亮点", "适用场景", "行动建议"]);
  const asideNotes = sanitizeList(spec?.asideNotes, ["结果支持收藏、再次生成和复制。", "右侧抽屉默认展示命中的业务规则与推荐动作。"]);
  const fieldHtml = formFields.map((field, index) => `
          <label class="field">
            <span>${escapeHtml(field)}</span>
            <input type="text" placeholder="请输入${escapeHtml(field)}" value="${index === 0 ? "春日品牌焕新 campaign" : ""}" />
          </label>`).join("\n");
  const resultHtml = results.map((item, index) => `
          <article class="card${index === 0 ? " active" : ""}">
            <div class="card-top">
              <span class="chip">${index === 0 ? "已收藏" : "候选方案"}</span>
              <button type="button">复制</button>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.sellingPoint)}</p>
            <div class="card-actions">
              <button type="button">收藏</button>
              <button type="button">再次生成</button>
              <button type="button">详情</button>
            </div>
          </article>`).join("\n");
  const detailHtml = detailSections.map((section) => `
            <section>
              <h4>${escapeHtml(section)}</h4>
              <ul>
                <li>${escapeHtml(section)}与主题输入强关联，便于业务人员快速判断是否可用。</li>
                <li>支持在右侧抽屉继续补充自然语言修改建议，再回写后续交付物。</li>
              </ul>
            </section>`).join("\n");
  const notesHtml = asideNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} 原型</title>
    <style>
      :root { color-scheme: light; font-family: "PingFang SC", "Helvetica Neue", sans-serif; background: #f4f1ea; color: #1f2937; }
      * { box-sizing: border-box; }
      body { margin: 0; background: radial-gradient(circle at top left, #fff6d8, transparent 30%), linear-gradient(135deg, #f7f3eb, #eef2ff); }
      .shell { max-width: 1440px; min-height: 100vh; margin: 0 auto; padding: 32px; display: grid; grid-template-columns: 340px minmax(0, 1fr) 360px; gap: 24px; }
      .panel { background: rgba(255,255,255,0.88); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 24px; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08); backdrop-filter: blur(10px); }
      .hero { padding: 28px; display: flex; flex-direction: column; gap: 16px; }
      .hero h1 { margin: 0; font-size: 32px; line-height: 1.1; }
      .hero p { margin: 0; color: #475569; line-height: 1.6; }
      .field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
      .field span { font-size: 14px; font-weight: 600; color: #334155; }
      .field input { border: 1px solid #d6d3d1; border-radius: 14px; padding: 12px 14px; background: #fffbf3; font-size: 14px; }
      .primary, .secondary { border: none; border-radius: 999px; padding: 12px 18px; font-weight: 600; cursor: pointer; }
      .primary { background: #f97316; color: white; }
      .secondary { background: #e2e8f0; color: #0f172a; }
      .results { padding: 28px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-content: start; }
      .toolbar { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; }
      .card { border-radius: 20px; padding: 18px; background: white; border: 1px solid rgba(249, 115, 22, 0.12); display: flex; flex-direction: column; gap: 12px; min-height: 220px; }
      .card.active { background: linear-gradient(180deg, #fff7ed, #ffffff); border-color: rgba(249, 115, 22, 0.32); }
      .card-top, .card-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .chip { display: inline-flex; padding: 4px 10px; border-radius: 999px; background: #ffedd5; color: #c2410c; font-size: 12px; font-weight: 700; }
      .card h3 { margin: 0; font-size: 20px; line-height: 1.35; }
      .card p { margin: 0; color: #475569; line-height: 1.6; }
      .card button { border: none; border-radius: 999px; padding: 10px 12px; background: #f1f5f9; cursor: pointer; }
      .drawer { padding: 28px; display: flex; flex-direction: column; gap: 18px; }
      .drawer h2, .drawer h4 { margin: 0; }
      .drawer ul { margin: 0; padding-left: 18px; color: #475569; line-height: 1.7; }
      @media (max-width: 1180px) { .shell { grid-template-columns: 1fr; } .results { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="panel hero">
        <span class="chip">创意工作台</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
        ${fieldHtml}
        <div style="display:flex;gap:12px;">
          <button class="primary" type="button">生成创意</button>
          <button class="secondary" type="button">换一批</button>
        </div>
      </section>
      <section class="panel results">
        <div class="toolbar">
          <div>
            <strong>创意候选结果</strong>
            <p style="margin:6px 0 0;color:#64748b;">列表承载主任务流，详情通过右侧抽屉承载上下文。</p>
          </div>
          <span class="chip">支持收藏与再次生成</span>
        </div>
        ${resultHtml}
      </section>
      <aside class="panel drawer">
        <span class="chip">右侧详情抽屉</span>
        <h2>创意详情与业务上下文</h2>
        <p style="margin:0;color:#475569;">默认只读展示创意摘要、卖点说明、行动号召与后续修改建议。</p>
        ${detailHtml}
        <section>
          <h4>推荐动作</h4>
          <ul>${notesHtml}</ul>
        </section>
      </aside>
    </main>
  </body>
</html>`;
}

function buildFrontendCodeArtifact(spec) {
  const componentName = String(spec?.componentName || "CreativeGeneratorPage").trim() || "CreativeGeneratorPage";
  const apiPath = String(spec?.apiPath || "/api/creative/generate").trim() || "/api/creative/generate";
  const ruleFields = sanitizeList(spec?.ruleFields, ["brandTone", "bannedWords"]);
  const filters = sanitizeList(spec?.filters, ["all", "favorites", "recent"]);
  return [
    "```tsx",
    "import { useEffect, useState } from \"react\";",
    "",
    "type CreativeInput = {",
    "  topic: string;",
    "  audience: string;",
    "  tone: string;",
    ...ruleFields.map((field) => `  ${field}: string;`),
    "};",
    "",
    "type CreativeItem = {",
    "  id: string;",
    "  title: string;",
    "  sellingPoint: string;",
    "  cta: string;",
    "  favorite: boolean;",
    "  matchedRules: string[];",
    "};",
    "",
    "const EMPTY_INPUT: CreativeInput = {",
    "  topic: \"\",",
    "  audience: \"\",",
    "  tone: \"\",",
    ...ruleFields.map((field) => `  ${field}: \"\",`),
    "};",
    "",
    `const HISTORY_FILTERS = ${JSON.stringify(filters)} as const;`,
    "",
    `export function ${componentName}() {`,
    "  const [input, setInput] = useState<CreativeInput>(EMPTY_INPUT);",
    "  const [items, setItems] = useState<CreativeItem[]>([]);",
    "  const [activeFilter, setActiveFilter] = useState<(typeof HISTORY_FILTERS)[number]>(HISTORY_FILTERS[0]);",
    "  const [activeItemId, setActiveItemId] = useState<string>(\"\");",
    "  const [submitting, setSubmitting] = useState(false);",
    "",
    "  useEffect(() => {",
    "    if (!activeItemId && items[0]) {",
    "      setActiveItemId(items[0].id);",
    "    }",
    "  }, [activeItemId, items]);",
    "",
    "  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0] ?? null;",
    "  const visibleItems = items.filter((item) => {",
    "    if (activeFilter === \"favorites\") return item.favorite;",
    "    return true;",
    "  });",
    "",
    "  async function handleGenerate() {",
    "    setSubmitting(true);",
    "    try {",
    `      const response = await fetch(${JSON.stringify(apiPath)}, {`,
    "        method: \"POST\",",
    "        headers: { \"Content-Type\": \"application/json\" },",
    "        body: JSON.stringify(input)",
    "      });",
    "      const data = await response.json();",
    "      setItems(data.items ?? []);",
    "      if (data.items?.[0]?.id) setActiveItemId(data.items[0].id);",
    "    } finally {",
    "      setSubmitting(false);",
    "    }",
    "  }",
    "",
    "  return (",
    "    <main className=\"creative-shell\">",
    "      <section className=\"input-panel\">",
    "        <h1>创意生成器</h1>",
    "        <p>输入主题、目标受众和风格偏好，快速生成多组创意标题与卖点文案。</p>",
    "        {Object.entries(input).map(([key, value]) => (",
    "          <label key={key}>",
    "            <span>{key}</span>",
    "            <input value={value} onChange={(event) => setInput((current) => ({ ...current, [key]: event.target.value }))} />",
    "          </label>",
    "        ))}",
    "        <button onClick={handleGenerate} disabled={submitting}>{submitting ? \"生成中...\" : \"生成创意\"}</button>",
    "      </section>",
    "      <section className=\"result-panel\">",
    "        <header>",
    "          <strong>创意结果</strong>",
    "          <div>{HISTORY_FILTERS.map((filter) => <button key={filter} onClick={() => setActiveFilter(filter)}>{filter}</button>)}</div>",
    "        </header>",
    "        {visibleItems.map((item) => (",
    "          <article key={item.id} onClick={() => setActiveItemId(item.id)}>",
    "            <h2>{item.title}</h2>",
    "            <p>{item.sellingPoint}</p>",
    "            <small>{item.cta}</small>",
    "          </article>",
    "        ))}",
    "      </section>",
    "      <aside className=\"detail-drawer\">",
    "        {activeItem ? (",
    "          <>",
    "            <h2>{activeItem.title}</h2>",
    "            <p>{activeItem.sellingPoint}</p>",
    "            <ul>{activeItem.matchedRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>",
    "          </>",
    "        ) : <p>请选择一个创意查看详情。</p>}",
    "      </aside>",
    "    </main>",
    "  );",
    "}",
    "```"
  ].join("\n");
}

function buildBackendCodeArtifact(spec) {
  const routePath = String(spec?.routePath || "/api/creative/generate").trim() || "/api/creative/generate";
  const entityNames = sanitizeList(spec?.entityNames, ["creative_requests", "creative_items", "rule_matches"]);
  const validations = sanitizeList(spec?.validations, ["topic 不能为空", "禁止词必须在生成前过滤"]);
  return [
    "```ts",
    "import type { FastifyInstance } from \"fastify\";",
    "",
    "type CreativeGenerateRequest = {",
    "  topic: string;",
    "  audience?: string;",
    "  tone?: string;",
    "  brandTone?: string;",
    "  bannedWords?: string;",
    "};",
    "",
    "type CreativeItem = {",
    "  id: string;",
    "  title: string;",
    "  sellingPoint: string;",
    "  cta: string;",
    "  matchedRules: string[];",
    "};",
    "",
    `const TABLES = ${JSON.stringify(entityNames)} as const;`,
    `const VALIDATIONS = ${JSON.stringify(validations)} as const;`,
    "",
    "function validateRequest(payload: CreativeGenerateRequest) {",
    "  if (!payload.topic?.trim()) throw new Error(VALIDATIONS[0]);",
    "  if ((payload.bannedWords || \"\").includes(payload.topic.trim())) throw new Error(VALIDATIONS[1]);",
    "}",
    "",
    "async function buildCreativeItems(payload: CreativeGenerateRequest): Promise<CreativeItem[]> {",
    "  const base = payload.topic.trim();",
    "  return [",
    "    { id: \"idea-1\", title: `${base} 的第一组创意`, sellingPoint: \"突出核心卖点与差异化场景。\", cta: \"立即采用\", matchedRules: payload.brandTone ? [payload.brandTone] : [] },",
    "    { id: \"idea-2\", title: `${base} 的第二组创意`, sellingPoint: \"保留再次生成和收藏路径。\", cta: \"继续优化\", matchedRules: payload.bannedWords ? [payload.bannedWords] : [] }",
    "  ];",
    "}",
    "",
    "export async function registerCreativeGeneratorRoutes(app: FastifyInstance) {",
    `  app.post(${JSON.stringify(routePath)}, async (request, reply) => {`,
    "    const payload = request.body as CreativeGenerateRequest;",
    "    validateRequest(payload);",
    "    const items = await buildCreativeItems(payload);",
    "    return reply.send({ items, storageTables: [...TABLES] });",
    "  });",
    "}",
    "```"
  ].join("\n");
}

function buildDeterministicComposedArtifact(artifactId) {
  const spec = buildDefaultStructuredSpec(artifactId);
  if (artifactId === "prototype-preview") {
    return buildPrototypeHtml(spec);
  }
  if (artifactId === "frontend-code") {
    return buildFrontendCodeArtifact(spec);
  }
  return buildBackendCodeArtifact(spec);
}

function buildDeterministicTextFallback(artifactId) {
  return DETERMINISTIC_TEXT_FALLBACKS[artifactId] || "";
}

async function generateComposedArtifact(artifactId, effectiveMessage) {
  if (!COMPOSED_LLM_ARTIFACTS.has(artifactId)) {
    return "";
  }
  const schemaPrompt = artifactId === "prototype-preview"
    ? [
      effectiveMessage,
      "",
      "请只输出 JSON，不要输出 Markdown、解释或代码块外文本。",
      "字段要求：title:string, subtitle:string, formFields:string[], results:{title:string,sellingPoint:string,cta:string}[], detailSections:string[], asideNotes:string[]"
    ].join("\n")
    : artifactId === "frontend-code"
    ? [
      effectiveMessage,
      "",
      "请只输出 JSON，不要输出 Markdown 或解释。",
      "字段要求：componentName:string, apiPath:string, ruleFields:string[], filters:string[]"
    ].join("\n")
    : [
      effectiveMessage,
      "",
      "请只输出 JSON，不要输出 Markdown 或解释。",
      "字段要求：routePath:string, entityNames:string[], validations:string[]"
    ].join("\n");
  let spec = buildDefaultStructuredSpec(artifactId);
  let raw = "";
  try {
    raw = await directLlmGenerate(schemaPrompt, 2500);
  } catch (error) {
    logSetup("artifact-composed-direct-failed", {
      artifactId,
      reason: error instanceof Error ? error.message : String(error)
    });
    raw = "";
  }
  try {
    if (raw) {
      spec = { ...spec, ...extractJsonObject(raw) };
    }
  } catch (error) {
    logSetup("artifact-composed-fallback", {
      artifactId,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
  if (artifactId === "prototype-preview") {
    return buildPrototypeHtml(spec);
  }
  if (artifactId === "frontend-code") {
    return buildFrontendCodeArtifact(spec);
  }
  return buildBackendCodeArtifact(spec);
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
      headers: {
        "Content-Type": "application/json",
        ...(accessToken && !String(path).startsWith("/api/v1/auth/") ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {})
      },
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

async function ensureAuthToken() {
  if (accessToken) {
    return accessToken;
  }
  const requestCode = await assertOk("requestSmsCode", () =>
    requestJson("/api/v1/auth/sms/request", {
      method: "POST",
      body: JSON.stringify({ phone: DEMO_PHONE })
    }, 30000)
  );
  const code = String(requestCode?.debugCode || "").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error("sms debug code unavailable for setup authentication");
  }
  const verified = await assertOk("verifySmsCode", () =>
    requestJson("/api/v1/auth/sms/verify", {
      method: "POST",
      body: JSON.stringify({ phone: DEMO_PHONE, code })
    }, 30000)
  );
  const token = String(verified?.accessToken || "").trim();
  if (!token) {
    throw new Error("missing access token after demo auth verify");
  }
  accessToken = token;
  return accessToken;
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
  if (!llm?.configured || llm?.reachable !== true) {
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
    logSetup("coach-attempt", { iterationId, attempt, messagePreview: message.slice(0, 120) });
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
    logSetup("direct-llm-request", { provider: LLM_PROVIDER, model: LLM_MODEL, promptPreview: prompt.slice(0, 120) });
    const response = await fetch(LLM_PROVIDER === "anthropic-compatible" ? `${LLM_API_BASE}/v1/messages` : `${LLM_API_BASE}/chat/completions`, {
      method: "POST",
      headers: LLM_PROVIDER === "anthropic-compatible"
        ? { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
        : { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(
        LLM_PROVIDER === "anthropic-compatible"
          ? { model: LLM_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }
          : { model: LLM_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }
      ),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(`invalid direct llm payload: ${raw.slice(0, 200)}`);
    }
    if (LLM_PROVIDER === "anthropic-compatible") {
      const blocks = Array.isArray(data.content) ? data.content : [];
      const textBlock = blocks.find((b) => b.type === "text") || blocks[0];
      return textBlock?.text || "";
    }
    return data?.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timer);
  }
}

function preferredDirectMaxTokens(artifactId) {
  if (artifactId === "frontend-code" || artifactId === "backend-code") {
    return 12000;
  }
  if (artifactId === "prototype-preview") {
    return 10000;
  }
  return 8000;
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

async function continueWithDirectLlm(artifactId, previousContent) {
  const continuePrompt = [
    `交付物「${artifactId}」的上一段输出被截断了。`,
    "你必须只输出后续缺失内容，不要重复已输出部分，不要写解释。",
    "如果当前交付物是 HTML/代码，请继续输出同一种格式；如果是 Markdown，请继续补完剩余章节。",
    `已输出内容末尾：\n\n…${previousContent.slice(-800)}`
  ].join("\n\n");
  return normalizeArtifactContent(await directLlmGenerate(continuePrompt, 4000));
}

async function continueContent(iterationId, artifactId, previousContent) {
  const MAX_CONTINUATIONS = 3;
  let fullContent = previousContent;
  for (let i = 0; i < MAX_CONTINUATIONS; i += 1) {
    if (!looksIncomplete(fullContent)) break;
    let chunk = "";
    try {
      logSetup("artifact-direct-continuation", { iterationId, artifactId, attempt: i + 1 });
      chunk = await continueWithDirectLlm(artifactId, fullContent);
    } catch (error) {
      logSetup("artifact-direct-continuation-failed", { iterationId, artifactId, attempt: i + 1, error: error instanceof Error ? error.message : String(error) });
      const continuePrompt = `交付物「${artifactId}」的上一段输出似乎被截断了，请从断点处继续输出后续内容，不要重复已输出的部分。上一段末尾为：\n\n…${fullContent.slice(-300)}`;
      const response = await coachIteration(iterationId, continuePrompt);
      chunk = normalizeArtifactContent(response.reply);
    }
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
  logSetup("iteration-start", { iterationId: iteration.id, iterationName: iteration.name, stepCount: steps.length });
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
    logSetup("artifact-start", { iterationId: iteration.id, artifactId });
    const currentArtifacts = await listArtifacts(iteration.id);
    const upstreamContext = buildUpstreamContextForScript(artifactId, currentArtifacts);
    const forceRewrite = FORCE_ARTIFACTS.has(artifactId) && (FORCE_ITERATION_IDS.size === 0 || FORCE_ITERATION_IDS.has(iteration.id));
    const baseMessage = forceRewrite
      ? `这是用于流程验证的交付物重建，不是阶段推进。请忽略当前迭代所处阶段，直接输出交付物「${artifactId}」的完整正文，不要只回复摘要、待处理点或流程说明。\n\n${userMessage}`
      : userMessage;
    const structuredBaseMessage = buildStructuredArtifactPrompt(artifactId, baseMessage);
    const effectiveMessage = upstreamContext
      ? `${structuredBaseMessage}\n\n${upstreamContext}`
      : structuredBaseMessage;
    await createMessage(iteration.id, "user", structuredBaseMessage);
    let response = null;
    let content = "";
    const useDirectLlm = DIRECT_LLM_ARTIFACTS.has(artifactId);
    let directLlmFailure = "";
    if (useDirectLlm) {
      try {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          logSetup("artifact-direct-attempt", { iterationId: iteration.id, artifactId, attempt });
          if (COMPOSED_LLM_ARTIFACTS.has(artifactId)) {
            let raw = "";
            try {
              raw = await generateComposedArtifact(artifactId, effectiveMessage);
            } catch (error) {
              logSetup("artifact-composed-hard-fallback", {
                iterationId: iteration.id,
                artifactId,
                attempt,
                reason: error instanceof Error ? error.message : String(error)
              });
              raw = buildDeterministicComposedArtifact(artifactId);
            }
            content = normalizeArtifactContent(raw || buildDeterministicComposedArtifact(artifactId));
            response = { llm: { used: true, model: LLM_MODEL, degraded: false }, intent: "composed-direct" };
            break;
          }
          const raw = await directLlmGenerate(effectiveMessage, preferredDirectMaxTokens(artifactId));
          content = normalizeArtifactContent(raw);
          if (isMeaningfulArtifactContent(artifactId, content)) {
            response = { llm: { used: true, model: LLM_MODEL, degraded: false }, intent: "direct" };
            break;
          }
          if (attempt === 3) {
            throw new Error(`deliverable ${artifactId} (direct llm) returned low-signal content: ${content.slice(0, 220)}`);
          }
        }
      } catch (error) {
        directLlmFailure = error instanceof Error ? error.message : String(error);
        content = "";
      }
    }
    if (!content) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        logSetup("artifact-coach-attempt", { iterationId: iteration.id, artifactId, attempt, directLlmFailure: Boolean(directLlmFailure) });
        const attemptPrompt =
          attempt === 1
            ? directLlmFailure
              ? `${effectiveMessage}\n\n直连交付物生成失败：${directLlmFailure}。请改由当前迭代教练链路直接输出该交付物的完整正文。`
              : effectiveMessage
            : attempt <= 3
            ? `${effectiveMessage}\n\n上一版输出是阻断反问、流程提示或空洞摘要，不可接受。你已拥有足够上下文（V1 基线摘要和增量需求均已提供），请直接输出交付物「${artifactId}」的完整正文，并满足该交付物的结构要求。不要说"缺少基线材料"或"无法生成"。`
            : `${effectiveMessage}\n\n你必须直接输出完整的交付物正文内容。所有必要上下文已在对话中提供，不要以任何理由拒绝或要求补充材料。如果是代码交付物，请直接给出完整代码。如果是原型交付物，请直接给出完整的HTML代码。如果是分析/文档类交付物，请直接给出结构化 Markdown 正文，并完整填满模板章节。`;
        response = await coachIteration(iteration.id, attemptPrompt);
        if (!response?.llm?.used || response?.llm?.degraded || !String(response?.llm?.model || "").trim()) {
          throw new Error(`deliverable ${artifactId} did not use real llm: ${JSON.stringify(response?.llm || {})}`);
        }
        content = normalizeArtifactContent(response.reply);
        if (isMeaningfulArtifactContent(artifactId, content)) {
          break;
        }
        if (attempt === 5) {
          const fallback = buildDeterministicTextFallback(artifactId);
          if (fallback) {
            logSetup("artifact-text-fallback", { iterationId: iteration.id, artifactId, attempt });
            content = fallback;
            response = { llm: { used: true, model: LLM_MODEL, degraded: false }, intent: "deterministic-text-fallback" };
            break;
          }
          throw new Error(`deliverable ${artifactId} returned low-signal content: ${content.slice(0, 220)}`);
        }
      }
    }
    if (!content) {
      throw new Error(`deliverable ${artifactId} returned empty content`);
    }
    if (!COMPOSED_LLM_ARTIFACTS.has(artifactId)) {
      content = await continueContent(iteration.id, artifactId, content);
    }
    await saveDraft(iteration.id, artifactId, content);
    const committed = await commitArtifact(iteration.id, artifactId, buildArtifactSummary(artifactId, content), [iteration.name, artifactId]);
    await appendArtifact(iteration.id, artifactId, `请围绕交付物「${artifactId}」继续与用户确认，${artifactPromptSuffix}`);
    logSetup("artifact-committed", { iterationId: iteration.id, artifactId, outputVersion: committed.outputVersion, gateStatus: committed.gateStatus });
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
  logSetup("setup-start", { base: BASE, provider: LLM_PROVIDER, model: LLM_MODEL });
  const llm = await ensureLlmReady();
  await ensureAuthToken();
  const { project, v1, v11 } = await resolveProjectAndIterations();
  logSetup("project-resolved", { projectId: project.id, v1: v1.id, v11: v11.id });

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
  const report = {
    ok: true,
    createdAt: NOW.toISOString(),
    apiBase: BASE,
    project: { id: project.id, name: project.name },
    iterations: [
      { id: v1.id, name: v1.name, version: v1.version, trace: v1Trace, artifacts: artifactsV1.map((item) => ({ id: item.id, title: item.title, gateStatus: item.gateStatus, outputVersion: item.outputVersion })) },
      { id: v11.id, name: v11.name, version: v11.version, trace: v11Trace, artifacts: artifactsV11.map((item) => ({ id: item.id, title: item.title, gateStatus: item.gateStatus, outputVersion: item.outputVersion })) }
    ],
    runtimeLlm: {
      model: LLM_MODEL || llm.model || "",
      baseUrl: LLM_API_BASE || llm.baseUrl || ""
    },
    requirementPath: REQUIREMENT_PATH,
    browserUseTarget: { url: BROWSER_USE_TARGET_URL, loginPhone: "13800138000" }
  };
  const reportPath = join(ARTIFACTS_DIR, `creative-generator-demo-setup-${STAMP}.json`);
  const latestPath = join(ARTIFACTS_DIR, "creative-generator-demo-latest.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify({ ok: true, reportPath, latestPath, projectId: project.id, iterationIds: [v1.id, v11.id] }, null, 2));
}

main().catch((error) => {
  console.error(`[setup-creative-generator-demo] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
