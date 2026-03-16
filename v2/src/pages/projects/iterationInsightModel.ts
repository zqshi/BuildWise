import type { AttachmentAnalysisReport } from "../../domain/workspace/analysisTypes";
import type {
  Iteration,
  IterationArtifactStage,
  IterationArtifactWorkflowItem,
  IterationStateMachinePayload,
  IterationStatus
} from "../../domain/workspace/iterationTypes";

export type MatrixSummary = {
  total: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  coverage: number;
  passRate: number;
};

export type IterationMetricItem = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type IterationGuidanceModel = {
  title: string;
  narrative: string;
  checkpoints: string[];
  quickActions: string[];
};

const stageLabelMap: Record<IterationArtifactStage, string> = {
  clarification: "澄清",
  scope: "范围",
  interaction: "交互",
  development: "开发",
  testing: "测试",
  release: "发布",
  archive: "归档"
};

const statusLabelMap: Record<IterationStatus, string> = {
  planned: "规划中",
  "in-progress": "进行中",
  review: "评审中",
  blocked: "阻塞中",
  completed: "已完成"
};

const cyclePhaseNarrativeMap: Partial<Record<NonNullable<AttachmentAnalysisReport["cyclePhase"]>, string>> = {
  "scope-clarified": "范围已经初步收敛，接下来重点是把澄清结论沉淀为可追踪的边界与验收条目。",
  "task-planning": "当前处于任务规划窗口，优先把高价值任务拆解清楚，再进入开发执行。",
  "build-in-progress": "开发推进阶段建议以“实现-验证-回写证据”为闭环，避免仅更新状态不沉淀证据。",
  "qa-review": "已进入质量评审窗口，建议先清理失败/阻断项，再决定是否进入发布评审。",
  "ready-for-release": "发布准备基本就绪，下一步应聚焦门禁复核与回滚条件确认。"
};

function buildStatusNarrative(iterationStatus: IterationStatus, stateMachine: IterationStateMachinePayload | null) {
  const transitionHint =
    stateMachine && stateMachine.allowedTransitions.length > 0
      ? `可流转到：${stateMachine.allowedTransitions.map((item) => statusLabelMap[item]).join("、")}。`
      : "当前无可执行流转动作，建议先补齐前置条件。";
  if (iterationStatus === "blocked") {
    return `当前状态为阻塞中，优先处理阻断项并在会话中给出恢复路径。${transitionHint}`;
  }
  if (iterationStatus === "review") {
    return `当前状态为评审中，建议围绕验收证据和风险处置做最后确认。${transitionHint}`;
  }
  if (iterationStatus === "completed") {
    return `当前状态为已完成，建议确认归档与下迭代继承输入。${transitionHint}`;
  }
  return `当前状态为${statusLabelMap[iterationStatus]}，建议按“确认 -> 交付 -> 复核”持续推进。${transitionHint}`;
}

export function summarizeArtifactProgress(items: IterationArtifactWorkflowItem[]) {
  const total = items.length;
  const ready = items.filter((item) => item.status === "ready").length;
  const partial = items.filter((item) => item.status === "partial").length;
  const pending = items.filter((item) => item.status === "pending").length;
  const blocked = items.filter((item) => item.gateStatus === "blocked").length;
  const stale = items.filter((item) => item.stale).length;
  return { total, ready, partial, pending, blocked, stale };
}

export function selectCoreDeliverables(
  items: IterationArtifactWorkflowItem[],
  activeStage: IterationArtifactStage,
  limit = 4
) {
  if (items.length === 0) return [];
  const active = items.filter((item) => item.stage === activeStage);
  const blocked = items.filter((item) => item.gateStatus === "blocked" && item.stage !== activeStage);
  const partial = items.filter((item) => item.status === "partial" && item.stage !== activeStage);
  const stale = items.filter((item) => item.stale && item.stage !== activeStage);
  const ready = items.filter((item) => item.status === "ready" && item.stage !== activeStage);
  const merged = [...active, ...blocked, ...partial, ...stale, ...ready];
  const seen = new Set<string>();
  const deduped = merged.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return deduped.slice(0, limit);
}

export function buildIterationMetrics(params: {
  iteration: Iteration | null;
  analysisReport: AttachmentAnalysisReport | null;
  matrixSummary: MatrixSummary;
  materialRisks: string[];
  materialSuggestions: string[];
  recentTransitionCount: number;
  artifactItems: IterationArtifactWorkflowItem[];
}) {
  const { iteration, analysisReport, matrixSummary, materialRisks, materialSuggestions, recentTransitionCount, artifactItems } = params;
  const progress = summarizeArtifactProgress(artifactItems);
  const metrics: IterationMetricItem[] = [];
  if (progress.total > 0) {
    metrics.push({
      id: "artifact-progress",
      label: "交付物完成度",
      value: `${progress.ready}/${progress.total}`,
      detail: `进行中 ${progress.partial} · 待处理 ${progress.pending}`
    });
  }
  if (matrixSummary.total > 0) {
    metrics.push({
      id: "test-coverage",
      label: "测试覆盖率",
      value: `${matrixSummary.coverage}%`,
      detail: `已执行 ${matrixSummary.executed}/${matrixSummary.total}`
    });
    metrics.push({
      id: "test-pass-rate",
      label: "测试通过率",
      value: `${matrixSummary.passRate}%`,
      detail: `通过 ${matrixSummary.passed} · 失败 ${matrixSummary.failed} · 阻断 ${matrixSummary.blocked}`
    });
  }
  if (materialRisks.length > 0 || progress.blocked > 0) {
    metrics.push({
      id: "risk-count",
      label: "风险项",
      value: `${materialRisks.length + progress.blocked} 条`,
      detail: `分析风险 ${materialRisks.length} · 阻断门禁 ${progress.blocked}`
    });
  }
  if (iteration?.changeControl?.clarificationQuestions?.length) {
    metrics.push({
      id: "clarification",
      label: "待澄清问题",
      value: `${iteration.changeControl.clarificationQuestions.length} 项`,
      detail: iteration.changeControl.pendingHumanConfirmation ? "需人工确认后推进" : "可继续在会话中收敛"
    });
  }
  const highValueCount = (analysisReport?.prioritizedFindings || []).filter((item) => item.priority === "P0" || item.priority === "P1").length;
  if (highValueCount > 0) {
    metrics.push({
      id: "high-value",
      label: "高优先级发现",
      value: `${highValueCount} 条`,
      detail: `建议动作 ${materialSuggestions.length} 条`
    });
  }
  if (recentTransitionCount > 0) {
    metrics.push({
      id: "transition",
      label: "状态流转",
      value: `${recentTransitionCount} 次`,
      detail: "最近已发生状态切换"
    });
  }
  return metrics.slice(0, 6);
}

export function buildIterationGuidance(params: {
  iteration: Iteration | null;
  analysisReport: AttachmentAnalysisReport | null;
  stateMachine?: IterationStateMachinePayload | null;
  matrixSummary: MatrixSummary;
  materialRisks: string[];
  artifactItems: IterationArtifactWorkflowItem[];
  activeStage: IterationArtifactStage;
}) {
  const { iteration, analysisReport, stateMachine = null, matrixSummary, materialRisks, artifactItems, activeStage } = params;
  const progress = summarizeArtifactProgress(artifactItems);
  const stageLabel = stageLabelMap[activeStage];
  const cyclePhase = analysisReport?.cyclePhase;
  const phaseLabel = cyclePhase ? cyclePhaseNarrativeMap[cyclePhase] || `当前分析判断处于「${cyclePhase}」阶段` : `当前流程聚焦在「${stageLabel}」阶段`;
  const statusNarrative = buildStatusNarrative(iteration?.status || "planned", stateMachine);
  const blockedText =
    progress.blocked > 0 || materialRisks.length > 0
      ? `目前有 ${progress.blocked + materialRisks.length} 个风险/阻断信号，建议先清理再推进。`
      : "当前未发现硬性阻断，可按节奏推进当前阶段交付。";
  const matrixText =
    matrixSummary.total > 0
      ? `测试矩阵覆盖率 ${matrixSummary.coverage}%，通过率 ${matrixSummary.passRate}%。`
      : "测试矩阵尚未形成，建议在进入测试阶段前先生成用例与验收清单。";
  const pendingClarification = iteration?.changeControl?.clarificationQuestions?.length || 0;

  const checkpoints = [
    statusNarrative,
    phaseLabel,
    blockedText,
    pendingClarification > 0 ? `待澄清问题还有 ${pendingClarification} 项，可直接在会话中逐条确认。` : "澄清项已收敛，可以转向交付与验收。",
    matrixText
  ];
  const quickActions: string[] = [];
  if (!analysisReport) {
    quickActions.push("上传附件并触发分析", "查看分析报告");
  } else {
    if (pendingClarification > 0) {
      quickActions.push("确认边界并推进");
    }
    if (matrixSummary.total === 0) {
      quickActions.push("生成测试矩阵");
    } else if (matrixSummary.failed > 0 || matrixSummary.blocked > 0) {
      quickActions.push("查看分析报告");
      quickActions.push("验收修复后复测");
    }
  }
  if (quickActions.length === 0) {
    quickActions.push("查看分析报告", "继续推进当前交付物");
  }
  if (stateMachine?.allowedTransitions?.includes("review")) {
    quickActions.unshift("流转到评审中");
  } else if (stateMachine?.allowedTransitions?.includes("in-progress")) {
    quickActions.unshift("流转到进行中");
  }
  return {
    title: "自然语言引导",
    narrative: `基于当前迭代状态（${statusLabelMap[iteration?.status || "planned"]}）与交付进度，系统建议你以“对话确认 -> 交付提交 -> 指标复核”的顺序推进。`,
    checkpoints: checkpoints.slice(0, 4),
    quickActions: quickActions.slice(0, 3)
  } satisfies IterationGuidanceModel;
}
