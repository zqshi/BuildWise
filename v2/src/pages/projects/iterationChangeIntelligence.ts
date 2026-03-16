import type { Iteration, IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";

const sourceLabelMap = {
  "natural-language": "自然语言",
  document: "文档",
  html: "HTML",
  image: "图片",
  selection: "点选",
  "history-reference": "历史引用",
  mixed: "混合输入",
  unknown: "未识别"
} as const;

export type ChangeIntelligenceSummary = {
  sourceLabel: string;
  rawInput: string;
  attachments: string[];
  references: string[];
  knowledgeHits: string[];
  knowledgeConflicts: string[];
  normalizedFunctionalPoints: string[];
  impactedArtifactIds: string[];
};

export type ArtifactImpactSummary = {
  artifactId: string;
  artifactTitle: string;
  sourceTypes: string[];
  functionalPoints: string[];
  requirementRefs: string[];
  componentRefs: string[];
  codePaths: string[];
};

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildChangeIntelligenceSummary(iteration: Iteration | null): ChangeIntelligenceSummary | null {
  const changeControl = iteration?.changeControl;
  if (!changeControl) {
    return null;
  }
  const changeSource = changeControl.changeSource;
  const sourceType = changeSource?.type || "unknown";
  const impactedArtifactIds = uniqueStrings(
    (changeControl.mappingAuditTrail || []).flatMap((item) => item.impactedArtifacts || [])
  );
  const summary = {
    sourceLabel: sourceLabelMap[sourceType] || sourceLabelMap.unknown,
    rawInput: changeSource?.rawInput || "",
    attachments: changeSource?.attachments || [],
    references: changeSource?.references || [],
    knowledgeHits: changeControl.knowledgeHits || [],
    knowledgeConflicts: changeControl.knowledgeConflicts || [],
    normalizedFunctionalPoints: changeControl.normalizedFunctionalPoints || [],
    impactedArtifactIds
  };
  const hasMeaningfulContent =
    sourceType !== "unknown" ||
    summary.rawInput.length > 0 ||
    summary.attachments.length > 0 ||
    summary.references.length > 0 ||
    summary.knowledgeHits.length > 0 ||
    summary.knowledgeConflicts.length > 0 ||
    summary.normalizedFunctionalPoints.length > 0 ||
    summary.impactedArtifactIds.length > 0;
  return hasMeaningfulContent ? summary : null;
}

export function buildChangeIntelligenceHeadline(summary: ChangeIntelligenceSummary | null) {
  if (!summary) {
    return "";
  }
  const parts: string[] = [];
  if (summary.normalizedFunctionalPoints.length > 0) {
    parts.push(`${summary.normalizedFunctionalPoints.length} 个功能点`);
  }
  if (summary.knowledgeHits.length > 0) {
    parts.push(`${summary.knowledgeHits.length} 条知识命中`);
  }
  if (summary.knowledgeConflicts.length > 0) {
    parts.push(`${summary.knowledgeConflicts.length} 条约束冲突`);
  }
  if (summary.impactedArtifactIds.length > 0) {
    parts.push(`${summary.impactedArtifactIds.length} 个受影响交付物`);
  }
  return parts.join(" · ") || `输入来源：${summary.sourceLabel}`;
}

export function buildArtifactImpactSummary(
  iteration: Iteration | null,
  artifact: Pick<IterationArtifactWorkflowItem, "id" | "title"> | null
): ArtifactImpactSummary | null {
  const changeControl = iteration?.changeControl;
  if (!artifact || !changeControl) {
    return null;
  }
  const matched = (changeControl.mappingAuditTrail || []).filter((item) => item.impactedArtifacts.includes(artifact.id));
  if (matched.length === 0) {
    return null;
  }
  return {
    artifactId: artifact.id,
    artifactTitle: artifact.title,
    sourceTypes: uniqueStrings(matched.map((item) => sourceLabelMap[item.sourceType] || sourceLabelMap.unknown)),
    functionalPoints: uniqueStrings(matched.map((item) => item.functionalPoint)),
    requirementRefs: uniqueStrings(matched.flatMap((item) => item.requirementRefs || [])),
    componentRefs: uniqueStrings(matched.flatMap((item) => item.componentRefs || [])),
    codePaths: uniqueStrings(matched.flatMap((item) => item.codePaths || []))
  };
}

export function buildArtifactImpactHeadline(summary: ArtifactImpactSummary | null) {
  if (!summary) {
    return "";
  }
  const parts: string[] = [];
  if (summary.functionalPoints.length > 0) {
    parts.push(`${summary.functionalPoints.length} 个功能点`);
  }
  if (summary.requirementRefs.length > 0) {
    parts.push(`${summary.requirementRefs.length} 条需求映射`);
  }
  if (summary.componentRefs.length > 0) {
    parts.push(`${summary.componentRefs.length} 个组件映射`);
  }
  if (summary.codePaths.length > 0) {
    parts.push(`${summary.codePaths.length} 条代码边界`);
  }
  return parts.join(" · ") || "当前交付物存在映射上下文";
}
