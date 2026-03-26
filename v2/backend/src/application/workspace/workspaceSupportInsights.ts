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
