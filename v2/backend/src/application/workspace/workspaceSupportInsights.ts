import type { AttachmentAnalysisReport } from "../../domain/workspace/types";

function inferProjectCategory(text: string, iterationName: string) {
  const corpus = `${iterationName}\n${text}`.toLowerCase();
  const categories: Array<{ label: string; keywords: string[] }> = [
    { label: "数据分析 / 仪表盘项目", keywords: ["dashboard", "kpi", "指标", "报表", "统计", "看板"] },
    { label: "交易 / 电商项目", keywords: ["订单", "支付", "结算", "购物车", "发票", "交易"] },
    { label: "流程审批 / 协作项目", keywords: ["流程", "审批", "工单", "协同", "待办", "状态流转"] },
    { label: "内容管理 / 门户项目", keywords: ["内容", "文章", "cms", "页面", "导航", "门户"] },
    { label: "账号与权限项目", keywords: ["登录", "注册", "权限", "角色", "用户", "鉴权"] }
  ];
  const scored = categories
    .map((item) => ({
      ...item,
      score: item.keywords.reduce((total, keyword) => total + (corpus.includes(keyword.toLowerCase()) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);
  if (!scored[0] || scored[0].score === 0) {
    return "通用业务系统迭代";
  }
  return scored[0].label;
}

function inferArtifactType(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase();
  if (/\.(fig|sketch|xd|psd)$/.test(lowerName)) {
    return "设计稿 / 原型文件";
  }
  if (/\.(pdf|doc|docx|md|txt)$/.test(lowerName) || mimeType.includes("pdf") || mimeType.includes("word")) {
    return "需求文档 / 说明文档";
  }
  if (/\.(json|ya?ml)$/.test(lowerName) || mimeType.includes("json")) {
    return "结构化配置 / 接口描述文件";
  }
  if (/\.(png|jpg|jpeg|webp|gif)$/.test(lowerName) || mimeType.startsWith("image/")) {
    return "界面截图 / 视觉稿";
  }
  return "通用业务附件";
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.filter((item) => item.trim()))).slice(0, 6);
}

function inferProductName(text: string, fallback: string) {
  const clean = text.replace(/\s+/g, " ");
  const rules = [
    /产品[:：]\s*([^\n，。；;]{2,40})/i,
    /系统[:：]\s*([^\n，。；;]{2,40})/i,
    /项目[:：]\s*([^\n，。；;]{2,40})/i
  ];
  for (const rule of rules) {
    const matched = clean.match(rule);
    if (matched?.[1]) {
      return matched[1].trim();
    }
  }
  return fallback;
}

function inferProjectName(iterationName: string, fallback: string) {
  const name = iterationName.trim();
  if (name.length > 0) {
    return name;
  }
  return fallback;
}

export function detectProjectAndProduct(params: {
  excerpt: string;
  iterationName: string;
  fileName: string;
  fileCount: number;
  projectCategoryHint?: string;
}) {
  const { excerpt, iterationName, fileName, fileCount, projectCategoryHint } = params;
  const projectName = inferProjectName(iterationName, fileCount > 1 ? "附件项目分析" : fileName);
  const productName = inferProductName(excerpt, projectName);
  const projectCategory = projectCategoryHint || inferProjectCategory(excerpt, iterationName);
  const evidence: string[] = [];
  if (iterationName.trim()) {
    evidence.push(`迭代名称：${iterationName}`);
  }
  if (fileCount > 1) {
    evidence.push(`上传文件数：${fileCount}`);
  }
  const productMention = excerpt.match(/(产品|系统|项目)[:：]\s*[^\n，。；;]{2,40}/i)?.[0];
  if (productMention) {
    evidence.push(`文本命中：${productMention.trim()}`);
  }
  const lower = excerpt.toLowerCase();
  if (/(dashboard|kpi|指标|报表|订单|支付|发票|权限|审批)/i.test(lower)) {
    evidence.push("领域关键词命中：业务核心对象清晰");
  }
  const confidence: "high" | "medium" | "low" = evidence.length >= 3 ? "high" : evidence.length >= 1 ? "medium" : "low";
  return {
    projectName,
    productName,
    projectCategory,
    evidence: uniqueStrings(evidence).slice(0, 4),
    confidence
  };
}

export function buildMeaningfulFindings(params: {
  added: string[];
  changed: string[];
  removed: string[];
  characteristics: string[];
  risks: string[];
  diffLocations: AttachmentAnalysisReport["diffLocations"];
}) {
  const { added, changed, removed, characteristics, risks, diffLocations } = params;
  const findings: string[] = [];
  if (added.length > 0) {
    findings.push(`新增范围 ${added.length} 项：${added.slice(0, 3).join("；")}`);
  }
  if (changed.length > 0) {
    findings.push(`关键变更 ${changed.length} 项：${changed.slice(0, 3).join("；")}`);
  }
  if (removed.length > 0) {
    findings.push(`移除项 ${removed.length} 项：${removed.slice(0, 2).join("；")}`);
  }
  if (characteristics.length > 0) {
    findings.push(...characteristics.slice(0, 3).map((item) => `特征：${item}`));
  }
  const materialRisks = risks.filter((item) => item.trim() && !item.includes("暂无显式风险"));
  if (materialRisks.length > 0) {
    findings.push(...materialRisks.slice(0, 2).map((item) => `风险：${item}`));
  }
  if (diffLocations.length > 0) {
    findings.push(`差异定位命中 ${diffLocations.length} 处，覆盖维度：${Array.from(new Set(diffLocations.map((item) => item.dimension))).join("、")}`);
  }
  return uniqueStrings(findings).filter((item) => item.replace(/[\s:：;；。,.]/g, "").length >= 8).slice(0, 8);
}

export function prioritizeFindings(findings: string[]) {
  const deduped = uniqueStrings(findings);
  return deduped.slice(0, 8).map((content) => {
    const lower = content.toLowerCase();
    if (/风险|阻断|失败|回滚|故障|blocked|failed/.test(lower)) {
      return { priority: "P0" as const, content, reason: "涉及发布风险或阻断项" };
    }
    if (/变更|新增|差异|接口|数据|验收|覆盖/.test(lower)) {
      return { priority: "P1" as const, content, reason: "涉及范围/实现/验收关键变更" };
    }
    return { priority: "P2" as const, content, reason: "辅助信息，建议跟进确认" };
  });
}

export function buildNextActions(params: {
  prioritizedFindings: Array<{ priority: "P0" | "P1" | "P2"; content: string }>;
  boundaryCodePaths: string[];
  clarificationQuestions: string[];
}) {
  const actions: string[] = [];
  const p0 = params.prioritizedFindings.filter((item) => item.priority === "P0").map((item) => item.content);
  if (p0.length > 0) {
    actions.push(`优先处理 P0：${p0.slice(0, 2).join("；")}`);
  }
  if (params.boundaryCodePaths.length > 0) {
    actions.push(`按边界先改动：${params.boundaryCodePaths.slice(0, 3).join("、")}`);
  } else {
    actions.push("先确认变更边界（组件/代码路径白名单）再实施开发。");
  }
  if (params.clarificationQuestions.length > 0) {
    actions.push(`先补齐澄清问题：${params.clarificationQuestions.slice(0, 2).join("；")}`);
  }
  actions.push("完成后同步更新测试矩阵执行状态并触发 preflight。");
  return uniqueStrings(actions).slice(0, 6);
}

export function buildAttachmentInsights(params: {
  fileName: string;
  mimeType: string;
  excerpt: string;
  strategy: string;
  iterationName: string;
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  added: string[];
  changed: string[];
  removed: string[];
}): AttachmentAnalysisReport["attachmentInsights"] {
  const { fileName, mimeType, excerpt, strategy, iterationName, diffLocations, added, changed, removed } = params;
  const cleanExcerpt = excerpt.replace(/\s+/g, " ").trim();
  const lowered = cleanExcerpt.toLowerCase();
  const characteristics: string[] = [];
  if (lowered.includes("kpi") || lowered.includes("指标") || lowered.includes("统计")) {
    characteristics.push("涉及指标口径或数据展示调整");
  }
  if (lowered.includes("页面") || lowered.includes("布局") || lowered.includes("ui") || lowered.includes("交互")) {
    characteristics.push("包含页面结构或交互体验改动");
  }
  if (lowered.includes("接口") || lowered.includes("api") || lowered.includes("数据")) {
    characteristics.push("涉及接口或数据模型协同变更");
  }
  if (diffLocations.some((item) => item.dimension === "acceptanceCriteria")) {
    characteristics.push("验收标准发生变化，需同步测试用例");
  }
  if (diffLocations.some((item) => item.dimension === "inScope")) {
    characteristics.push("范围项发生调整，需确认边界与优先级");
  }
  const safeCharacteristics =
    uniqueStrings(characteristics).length > 0 ? uniqueStrings(characteristics) : ["以需求范围调整为主，建议结合迭代目标进一步确认细节"];
  const versionChangeSummary = `相较上版新增 ${added.length} 项、变更 ${changed.length} 项、移除 ${removed.length} 项；重点变化：${
    [...added.slice(0, 2), ...changed.slice(0, 2), ...removed.slice(0, 1)].join("；") || "暂无结构化差异"
  }。`;
  const limitations: string[] = [];
  if (strategy === "binary-no-text") {
    limitations.push("附件无法直接提取文本，部分判断来自文件类型与版本上下文。");
  }
  if (!cleanExcerpt) {
    limitations.push("附件文字信息不足，建议补充核心需求与验收标准。");
  }
  if (diffLocations.length === 0) {
    limitations.push("暂未识别到结构化差异，可能属于视觉微调或描述粒度不足。");
  }
  return {
    projectCategory: inferProjectCategory(cleanExcerpt, iterationName),
    artifactType: inferArtifactType(fileName, mimeType),
    keyCharacteristics: safeCharacteristics,
    versionChangeSummary,
    confidence: strategy === "binary-no-text" || !cleanExcerpt ? "low" : cleanExcerpt.length > 100 ? "high" : "medium",
    limitations: uniqueStrings(limitations)
  };
}
