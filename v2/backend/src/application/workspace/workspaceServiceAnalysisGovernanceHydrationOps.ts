import type { AttachmentAnalysisReport } from "../../domain/workspace/types";
import type { parseGovernanceInsightsCandidate } from "./workspaceServiceAnalysisGovernanceOps";
import type { parseReleaseReviewCandidate } from "./workspaceServiceAnalysisReleaseReviewOps";
import type { parseReportQualityCandidate } from "./workspaceServiceAnalysisReportQualityOps";

function uniqueTrimmed(values: string[], limit = 16) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function buildFallbackDomainTerms(params: {
  requirements: string[];
  components: string[];
  codePaths: string[];
}) {
  const requirementTerms = params.requirements.slice(0, 6).map((requirement) => ({
    term: requirement,
    definition: "从当前迭代需求边界提取，需结合附件证据继续细化。",
    mappedTo: {
      pages: [],
      apis: [],
      entities: [],
      codePaths: params.codePaths.slice(0, 4)
    },
    evidence: "derived-from-requirements",
    bindingStrength: "medium" as const
  }));
  const componentTerms = params.components.slice(0, 6).map((component) => ({
    term: component,
    definition: "从当前迭代组件边界提取，需结合实现证据继续确认。",
    mappedTo: {
      pages: [component],
      apis: [],
      entities: [],
      codePaths: params.codePaths.slice(0, 4)
    },
    evidence: "derived-from-components",
    bindingStrength: "medium" as const
  }));
  return [...requirementTerms, ...componentTerms].slice(0, 12);
}

export function hydrateGovernanceInsightsCandidate(
  candidate: ReturnType<typeof parseGovernanceInsightsCandidate>,
  params: {
    requirements: string[];
    components: string[];
    codePaths: string[];
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    diffLocations: AttachmentAnalysisReport["diffLocations"];
    added: string[];
    changed: string[];
    removed: string[];
    clarificationQuestions: string[];
  }
) {
  const fallbackRequirementToComponent =
    candidate.traceabilityMap.requirementToComponent.length > 0
      ? candidate.traceabilityMap.requirementToComponent
      : params.requirements.slice(0, 8).map((requirement) => ({
          requirement,
          components: params.components.slice(0, 4),
          evidence: "derived-from-boundary"
        }));
  const fallbackComponentToCode =
    candidate.traceabilityMap.componentToCode.length > 0
      ? candidate.traceabilityMap.componentToCode
      : params.components.slice(0, 8).map((component) => ({
          component,
          codePaths: params.codePaths.slice(0, 6),
          evidence: "derived-from-boundary"
        }));
  const fallbackRequirementToCode =
    candidate.traceabilityMap.requirementToCode.length > 0
      ? candidate.traceabilityMap.requirementToCode
      : params.requirements.slice(0, 8).map((requirement) => ({
          requirement,
          codePaths: params.codePaths.slice(0, 6),
          evidence: "derived-from-boundary"
        }));
  const fallbackCoverageScore =
    candidate.traceabilityMap.coverageScore > 0
      ? candidate.traceabilityMap.coverageScore
      : fallbackRequirementToCode.length > 0 || fallbackComponentToCode.length > 0
        ? 70
        : 0;
  const derivedRules = uniqueTrimmed(
    params.prioritizedFindings.map((item) => `${item.priority}:${item.content}`),
    12
  );
  const derivedUnknowns = uniqueTrimmed(params.clarificationQuestions, 12);
  return {
    versionDiffDetailed: {
      ...candidate.versionDiffDetailed,
      summary:
        candidate.versionDiffDetailed.summary ||
        `新增 ${params.added.length} 项，变更 ${params.changed.length} 项，移除 ${params.removed.length} 项。`,
      impactScope:
        candidate.versionDiffDetailed.impactScope.length > 0
          ? candidate.versionDiffDetailed.impactScope
          : uniqueTrimmed(params.diffLocations.map((item) => item.dimension), 8)
    },
    traceabilityMap: {
      ...candidate.traceabilityMap,
      requirementToComponent: fallbackRequirementToComponent,
      componentToCode: fallbackComponentToCode,
      requirementToCode: fallbackRequirementToCode,
      coverageScore: fallbackCoverageScore,
      mappingConfidence:
        candidate.traceabilityMap.mappingConfidence ||
        (fallbackCoverageScore >= 80 ? "high" : fallbackCoverageScore >= 50 ? "medium" : "low"),
      unmappedRequirements:
        candidate.traceabilityMap.unmappedRequirements.length > 0
          ? candidate.traceabilityMap.unmappedRequirements
          : params.requirements.filter(
              (item) => !fallbackRequirementToCode.some((mapping) => mapping.requirement === item)
            )
    },
    executableConstraints: {
      ...candidate.executableConstraints,
      componentWhitelist:
        candidate.executableConstraints.componentWhitelist.length > 0
          ? candidate.executableConstraints.componentWhitelist
          : params.components.slice(0, 24),
      codePathWhitelist:
        candidate.executableConstraints.codePathWhitelist.length > 0
          ? candidate.executableConstraints.codePathWhitelist
          : params.codePaths.slice(0, 24),
      gateRules:
        candidate.executableConstraints.gateRules.length > 0
          ? candidate.executableConstraints.gateRules
          : ["仅允许在边界内改动。", "发布前需完成测试与业务确认。"],
      acceptanceChecks:
        candidate.executableConstraints.acceptanceChecks.length > 0
          ? candidate.executableConstraints.acceptanceChecks
          : uniqueTrimmed(params.prioritizedFindings.map((item) => item.content), 16)
    },
    domainKnowledge: {
      ...candidate.domainKnowledge,
      terms:
        candidate.domainKnowledge.terms.length > 0
          ? candidate.domainKnowledge.terms
          : buildFallbackDomainTerms(params),
      rules:
        candidate.domainKnowledge.rules.length > 0 ? candidate.domainKnowledge.rules : derivedRules,
      unknowns:
        candidate.domainKnowledge.unknowns.length > 0 ? candidate.domainKnowledge.unknowns : derivedUnknowns
    }
  };
}

export function hydrateReportQualityCandidate(
  candidate: ReturnType<typeof parseReportQualityCandidate>,
  params: {
    deepInsights: AttachmentAnalysisReport["deepInsights"];
    businessConfirmation: AttachmentAnalysisReport["businessConfirmation"];
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    clarificationQuestions: string[];
  }
) {
  const missingItems = uniqueTrimmed([
    ...candidate.missingItems,
    ...(params.businessConfirmation.coreIntent ? [] : ["缺少核心目标"]),
    ...(params.businessConfirmation.evidenceRefs.length > 0 ? [] : ["缺少证据引用"]),
    ...(params.deepInsights.crossFileInsights.rootCauses.length > 0 ? [] : ["缺少跨文件根因"]),
    ...(params.deepInsights.crossFileInsights.decisionSuggestions.length > 0 ? [] : ["缺少决策建议"]),
    ...(params.clarificationQuestions.length > 0 ? ["存在未澄清问题"] : [])
  ]);
  const actionRequired = uniqueTrimmed([
    ...candidate.actionRequired,
    ...(params.businessConfirmation.evidenceRefs.length > 0 ? [] : ["补充附件或代码路径证据"]),
    ...(params.deepInsights.crossFileInsights.rootCauses.length > 0 ? [] : ["补充跨文件根因分析"]),
    ...(params.deepInsights.crossFileInsights.decisionSuggestions.length > 0 ? [] : ["补充面向决策的建议"]),
    ...(params.clarificationQuestions.length > 0 ? params.clarificationQuestions.map((item) => `澄清：${item}`) : [])
  ]);
  const completenessScore =
    (params.businessConfirmation.coreIntent ? 20 : 0) +
    (params.businessConfirmation.successCriteria.length > 0 ? 15 : 0) +
    (params.businessConfirmation.evidenceRefs.length > 0 ? 20 : 0) +
    (params.deepInsights.crossFileInsights.rootCauses.length > 0 ? 15 : 0) +
    (params.deepInsights.crossFileInsights.decisionSuggestions.length > 0 ? 15 : 0) +
    (params.prioritizedFindings.length > 0 ? 15 : 0);
  const adjustedScore =
    candidate.score > 0
      ? candidate.score
      : Math.max(0, Math.min(100, completenessScore - params.clarificationQuestions.length * 5));
  const publishable =
    candidate.publishable ||
    (adjustedScore >= 80 && missingItems.length === 0 && actionRequired.length <= 2 && params.clarificationQuestions.length === 0);
  return {
    ...candidate,
    publishable,
    score: adjustedScore,
    summary:
      candidate.summary ||
      (publishable
        ? "当前报告已具备业务可读性与关键证据，可进入发布确认。"
        : "当前报告仍有关键证据或决策信息缺口，暂不建议直接发布。"),
    missingItems,
    actionRequired
  };
}

export function hydrateReleaseReviewCandidate(
  candidate: ReturnType<typeof parseReleaseReviewCandidate>,
  params: {
    recommendations: string[];
    blockers: string[];
    releaseGates: string[];
    rollbackPlan: string[];
  }
) {
  return {
    ...candidate,
    reason:
      candidate.reason ||
      (candidate.decision === "go"
        ? "当前质量信号允许推进发布。"
        : candidate.decision === "block"
          ? "当前质量信号不足以支持发布。"
          : "建议谨慎发布并补齐关键确认项。"),
    blockers: candidate.blockers.length > 0 ? candidate.blockers : params.blockers.slice(0, 16),
    releaseGates: candidate.releaseGates.length > 0 ? candidate.releaseGates : params.releaseGates.slice(0, 16),
    recommendations: candidate.recommendations.length > 0 ? candidate.recommendations : params.recommendations.slice(0, 16),
    rollback: {
      ...candidate.rollback,
      actions: candidate.rollback.actions.length > 0 ? candidate.rollback.actions : params.rollbackPlan.slice(0, 16)
    }
  };
}
