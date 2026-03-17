const INTERNAL_LINE = /^\s*\[(skills|skill)\]/i;
const PLACEHOLDER_PATTERNS = [
  /已输出.*待处理点/,
  /已生成.*等待用户确认/,
  /请查看并确认该交付物/,
  /继续推进建议[:：]/,
  /补充建议[:：]/
];

const REQUIRED_KEYWORDS = {
  "analysis-report": [
    "目标用户",
    "问题定义",
    "核心场景",
    "纳入项",
    "排除项",
    "交互原则",
    "关键风险",
    "待确认点",
    "继承不变项",
    "本轮新增项",
    "业务规则变化",
    "影响范围",
    "受影响工程对象",
    "回归关注点"
  ],
  "product-requirements-doc": ["问题定义", "用户场景", "功能需求", "非功能", "验收标准"],
  "boundary-confirmation": ["in-scope", "out-of-scope", "关键约束", "验收", "codePath"],
  "design-spec": ["布局", "颜色", "字体", "状态", "响应式"],
  "technical-architecture": ["模块", "数据流", "接口", "依赖", "回滚"],
  "test-matrix": ["测试", "回归", "验证", "覆盖"],
  "acceptance-checklist": ["验收", "检查", "确认"],
  "release-review": ["发布结论", "阻断", "回滚"],
  "delivery-package": ["基线", "交付物", "遗留", "继承"]
};

export function normalizeArtifactContent(content) {
  return String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !INTERNAL_LINE.test(line))
    .join("\n")
    .trim();
}

function countKeywordHits(content, artifactId) {
  const keywords = REQUIRED_KEYWORDS[artifactId] || [];
  return keywords.filter((keyword) => content.includes(keyword)).length;
}

export function isMeaningfulArtifactContent(artifactId, content) {
  const normalized = normalizeArtifactContent(content);
  if (!normalized) {
    return false;
  }
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  if (artifactId === "prototype-preview") {
    return /<html|<body|<div|<section|<!doctype html/i.test(normalized);
  }
  if (artifactId === "code-delivery") {
    return /export\s+|function\s+|const\s+|interface\s+|type\s+/.test(normalized);
  }
  return countKeywordHits(normalized, artifactId) >= 2;
}

export function buildArtifactSummary(artifactId, content) {
  const normalized = normalizeArtifactContent(content);
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/^[-*#]+\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(line)));
  const prioritized = lines.filter((line) => /[:：]/.test(line));
  const source = prioritized.length > 0 ? prioritized : lines;
  const summary = source.slice(0, 2).join("；").slice(0, 220);
  if (summary) {
    return summary;
  }
  return artifactId === "prototype-preview"
    ? "已生成可渲染原型，请打开交付物查看详情。"
    : "已生成完整交付物，请打开查看正文。";
}
