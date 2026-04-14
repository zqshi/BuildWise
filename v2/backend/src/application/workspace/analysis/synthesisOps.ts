import type { AttachmentAnalysisReport } from '../../../domain/workspace/types';

export function buildClarificationQuestionsOp(params: {
  guardrail: { degraded: boolean; reason: string };
  unknownSignalCount: number;
  unknownSignalThreshold: number;
  strategy: string;
  diffLocations: AttachmentAnalysisReport["diffLocations"];
}) {
  const questions: string[] = [];
  if (params.guardrail.degraded) {
    questions.push(`当前分析触发上下文降级（${params.guardrail.reason}），请确认本次迭代边界是否仅包含已列出的差异项。`);
  }
  if (params.strategy === "binary-no-text") {
    questions.push("附件无法直接抽取文本。请补充该附件对应的核心需求、受影响页面/接口和验收标准。");
  }
  if (params.unknownSignalCount >= params.unknownSignalThreshold) {
    questions.push(`模型输出存在较多 unknown 信号（${params.unknownSignalCount}）。请确认关键事实：需求范围、数据口径、上线门禁。`);
  }
  if (params.diffLocations.length === 0) {
    questions.push("未识别到明确差异，请确认是否属于文案优化、布局微调或跨模块需求。");
  }
  return Array.from(new Set(questions));
}

export function mergeSynthesisResultsOp(
  base: {
    projectDetection: AttachmentAnalysisReport["projectDetection"];
    meaningfulFindings: string[];
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    nextActions: string[];
  },
  syntheses: Array<{
    projectDetection: AttachmentAnalysisReport["projectDetection"] | null;
    meaningfulFindings: string[] | null;
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"] | null;
    nextActions: string[] | null;
  }>
) {
  const projectDetection = { ...base.projectDetection };
  const findings = [...base.meaningfulFindings];
  const prioritized = [...base.prioritizedFindings];
  const nextActions = [...base.nextActions];
  for (const item of syntheses) {
    if (item.projectDetection) {
      if (item.projectDetection.projectName) {
        projectDetection.projectName = item.projectDetection.projectName;
      }
      if (item.projectDetection.productName) {
        projectDetection.productName = item.projectDetection.productName;
      }
      if (item.projectDetection.projectCategory) {
        projectDetection.projectCategory = item.projectDetection.projectCategory;
      }
      projectDetection.evidence = Array.from(new Set([...projectDetection.evidence, ...item.projectDetection.evidence])).slice(0, 5);
      if (item.projectDetection.confidence === "high") {
        projectDetection.confidence = "high";
      } else if (projectDetection.confidence === "low" && item.projectDetection.confidence === "medium") {
        projectDetection.confidence = "medium";
      }
    }
    if (item.meaningfulFindings?.length) {
      findings.push(...item.meaningfulFindings);
    }
    if (item.prioritizedFindings?.length) {
      prioritized.push(...item.prioritizedFindings);
    }
    if (item.nextActions?.length) {
      nextActions.push(...item.nextActions);
    }
  }
  return {
    projectDetection,
    meaningfulFindings: Array.from(new Set(findings)).slice(0, 10),
    prioritizedFindings: Array.from(
      new Map(prioritized.map((item) => [`${item.priority}:${item.content}`, item])).values()
    ).slice(0, 10),
    nextActions: Array.from(new Set(nextActions)).slice(0, 8)
  };
}
