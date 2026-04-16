const ARTIFACT_REFERENCE_PREFIX = "【交付物引用】";

function parseArtifactReferenceContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed.startsWith(ARTIFACT_REFERENCE_PREFIX)) {
    return null;
  }
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  const title = lines[0].replace(ARTIFACT_REFERENCE_PREFIX, "").trim() || "交付物";
  const prompt = lines.find((line) => line.startsWith("请基于") || line.startsWith("请围绕") || line.startsWith("请查看")) || "";
  return { title, prompt };
}

// ---------------------------------------------------------------------------
// 技术字段过滤：去除 system/assistant 消息中的内部字段路径和 JSON 片段
// ---------------------------------------------------------------------------

/** 匹配 camelCase key=value 格式的内部字段路径，如 sourceType=single-file, qualitySignals=testCaseCount:5 */
const FIELD_PATH_PATTERN = /\b[a-z][a-zA-Z]*(?:\.[a-zA-Z]+)*=[^\n]*/g;

/** 匹配独立的 JSON 块：覆盖质量审计、执行策略、洞察解析等内部 JSON 残留 */
const JSON_BLOCK_PATTERN = /\{[^{}]*"(?:publishable|score|missingItems|actionRequired|degraded|enforceSingleAgent|forceMultiAgent|promptBudgetRisk|projectCategory|artifactType|keyCharacteristics|versionChangeSummary|qualitySignals|testCaseCount|p0FindingCount|unknownSignalCount|boundaryCoverage|infoCompletion|completionActions|stagePlan|handoffPlan|rollbackDecision|shouldRollback|prioritizedFindings|meaningfulFindings|projectDetection|includedPaths|ignoredFiles|sampleReason|chunkFailureRate|repairAttempts|chunkBudget|chunkOverlap|chunkParallelism|coveragePercent|coverageScore|mappingConfidence|bindingStrength|executionStatus)"[^{}]*\}/g;

/** 匹配被 ```json 包裹的代码块 */
const CODE_BLOCK_PATTERN = /```json[\s\S]*?```/g;

/** 匹配内部审计标记如 <!-- coach:{...} --> */
const INTERNAL_TAG_PATTERN = /<!--\s*coach:\{[\s\S]*?\}\s*-->/g;

function stripTechnicalContent(text: string): string {
  return text
    .replace(CODE_BLOCK_PATTERN, "")
    .replace(JSON_BLOCK_PATTERN, "")
    .replace(FIELD_PATH_PATTERN, "")
    .replace(INTERNAL_TAG_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 清洗 system/assistant 消息中的技术内容，供教练对话上下文注入使用。
 * 移除内部字段路径（deep.cross.xxx=）、JSON 结构、代码块、审计标记。
 */
export function sanitizeForCoachContext(content: string): string {
  return stripTechnicalContent(content);
}

// ---------------------------------------------------------------------------
// 用户可见展示内容清洗：去除文件名、体积、英文技术缩写、框架名、内部术语
// ---------------------------------------------------------------------------

/** 文件名/路径：main.js、src/components/Foo.tsx、knowledgeCategories.js(27KB) */
const FILE_NAME_PATTERN = /\b[\w/.:-]+\.(?:tsx?|jsx?|vue|svelte|py|go|rs|java|rb|php|css|scss|less|html?|json|ya?ml|md|sql|sh|xml|toml|lock|map|mjs|cjs)\b(?:\(\d+(?:\.\d+)?[KkMm][Bb]\))?/g;

/** 文件体积：52KB、8.5MB、62KB */
const FILE_SIZE_PATTERN = /\b\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)*\s*[KkMm][Bb]\b/g;

/** 英文技术缩写 → 中文映射（仅独立出现时替换） */
const TECH_ABBREV_MAP: Array<[RegExp, string]> = [
  [/\bCDN\b/g, "内容分发"],
  [/\bAPI[s]?\b/g, "接口"],
  [/\bSDK[s]?\b/g, "开发工具包"],
  [/\bURLs?\b/g, "链接"],
  [/\bUI\b/g, "界面"],
  [/\bUX\b/g, "用户体验"],
  [/\bCSS\b/g, "样式"],
  [/\bHTML\b/g, "页面"],
  [/\bJSON\b/g, "数据格式"],
  [/\bSPA\b/g, "单页应用"],
  [/\bSSR\b/g, "服务端渲染"],
  [/\bCLI\b/g, "命令行工具"],
  [/\bREST\b/g, "接口"],
  [/\bGraphQL\b/g, "查询接口"],
  [/\bWebSockets?\b/g, "实时通信"],
  [/\bCRUD\b/g, "增删改查"],
  [/\bORM\b/g, "数据映射"],
  [/\bCI\/CD\b/g, "持续集成"],
  [/\bDocker\b/g, "容器"],
];

/** 前端/后端框架名：Tailwind CSS、React、Vue.js、Next.js、Express 等 */
const FRAMEWORK_PATTERN = /\b(?:Tailwind\s*CSS|React(?:\.js)?|Vue(?:\.js)?|Next\.js|Nuxt(?:\.js)?|Angular|Svelte|Express(?:\.js)?|Koa|Fastify|Django|Flask|Spring\s*Boot|Laravel|Rails|Webpack|Vite|Rollup|Babel|TypeScript|ESLint|Prettier|PostCSS|Sass|Less|jQuery|Bootstrap|Ant\s*Design|Material\s*UI|Chakra\s*UI|Bun|Deno|pnpm|Turbopack|esbuild|SWC|Prisma|Drizzle|tRPC|Zustand|Jotai|Recoil|Pinia)\b/gi;

/** 内部分析术语 → 中文（出现在中文语境中的英文） */
const INTERNAL_TERM_MAP: Array<[RegExp, string]> = [
  [/\bmustDo\b/g, "必须完成"],
  [/\bshouldDo\b/g, "建议纳入"],
  [/\bcanDefer\b/g, "可延期"],
  [/\boutOfScope\b/g, "超出范围"],
  [/\bBlockOutOfScope\b/g, "阻断超出范围"],
  [/\borchestrator\b/gi, "编排"],
  [/\bAgent交互\b/g, "智能助手交互"],
  [/\bLink组件\b/g, "链接组件"],
];

/**
 * 清洗单条展示文本中的技术内容。
 * 用于交付物合成输出中的各列表项、段落文本。
 */
export function sanitizeDisplayItem(text: string): string {
  if (!text) return text;
  let result = text;

  // 1. 文件名/路径
  result = result.replace(FILE_NAME_PATTERN, "");
  // 2. 文件体积
  result = result.replace(FILE_SIZE_PATTERN, "");
  // 3. 框架/库名
  result = result.replace(FRAMEWORK_PATTERN, "");
  // 4. 英文技术缩写翻译
  for (const [pattern, replacement] of TECH_ABBREV_MAP) {
    result = result.replace(pattern, replacement);
  }
  // 5. 内部分析术语翻译
  for (const [pattern, replacement] of INTERNAL_TERM_MAP) {
    result = result.replace(pattern, replacement);
  }
  // 6. 清理残留
  result = result
    .replace(/\(\s*\)/g, "")           // 空括号
    .replace(/、\s*、/g, "、")          // 连续顿号
    .replace(/\s{2,}/g, " ")           // 连续空格
    .replace(/^\s*[、，,]\s*/g, "")     // 行首标点
    .replace(/\s*[、，,]\s*$/g, "")     // 行尾标点
    .trim();
  return result;
}

// ---------------------------------------------------------------------------
// 用户消息标准化（交付物引用处理）
// ---------------------------------------------------------------------------

export function normalizeIterationMessageContent(role: "system" | "assistant" | "user", content: string) {
  const trimmed = content.trim();
  if (role === "system" || role === "assistant") {
    return stripTechnicalContent(trimmed);
  }
  const parsed = parseArtifactReferenceContent(trimmed);
  if (!parsed) {
    return trimmed;
  }
  if (/^请围绕交付物/.test(parsed.prompt)) {
    return parsed.prompt
      .replace(/继续与用户确认/g, "继续与我确认")
      .replace(/，?不要直接跨阶段推进。?$/g, "。")
      .trim();
  }
  if (/^请基于该交付物/.test(parsed.prompt)) {
    return parsed.prompt.replace(/^请基于该交付物/, `请基于交付物「${parsed.title}」`).trim();
  }
  return `请基于交付物「${parsed.title}」继续与我确认需要调整的内容。`;
}
