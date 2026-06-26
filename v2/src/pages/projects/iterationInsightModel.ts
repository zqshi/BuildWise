/**
 * Iteration insight model — derives metrics, guidance, and deliverable summaries from iteration state.
 */

type ArtifactItem = {
  id: string;
  stage: string;
  status: string;
  gateStatus: string;
  stale: boolean;
  title: string;
  [key: string]: unknown;
};

type ArtifactProgressSummary = {
  total: number;
  ready: number;
  partial: number;
  pending: number;
  blocked: number;
};

type MetricRow = {
  id: string;
  label: string;
  value: string;
};

type MatrixSummary = {
  total: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  coverage: number;
  passRate: number;
};

type IterationMetricsInput = {
  iteration: { changeControl?: { clarificationQuestions?: string[]; pendingHumanConfirmation?: boolean } };
  analysisReport: { prioritizedFindings?: Array<{ priority: string }> } | null;
  matrixSummary: MatrixSummary | null;
  materialRisks: string[];
  materialSuggestions: string[];
  recentTransitionCount: number;
  artifactItems: ArtifactItem[];
};

type IterationGuidanceInput = {
  iteration: { status: string; changeControl?: { clarificationQuestions?: string[] } };
  analysisReport: { cyclePhase?: string } | null;
  stateMachine: { allowedTransitions: string[] };
  matrixSummary: MatrixSummary | null;
  materialRisks: string[];
  artifactItems: ArtifactItem[];
  activeStage: string;
};

type IterationGuidance = {
  narrative: string;
  quickActions: string[];
  checkpoints: string[];
};

export function selectCoreDeliverables(items: ArtifactItem[], activeStage: string, limit: number): ArtifactItem[] {
  const scored = items.map((item) => {
    let score = 0;
    if (item.stage === activeStage) score += 10;
    if (item.gateStatus === "blocked") score += 5;
    if (item.status === "partial") score += 3;
    if (item.status === "ready") score += 2;
    if (item.status === "pending") score += 1;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.item);
}

export function summarizeArtifactProgress(items: ArtifactItem[]): ArtifactProgressSummary {
  let ready = 0;
  let partial = 0;
  let pending = 0;
  let blocked = 0;
  for (const item of items) {
    if (item.status === "ready") ready++;
    else if (item.status === "partial") partial++;
    else if (item.status === "pending") pending++;
    if (item.gateStatus === "blocked") blocked++;
  }
  return { total: items.length, ready, partial, pending, blocked };
}

export function buildIterationMetrics(input: IterationMetricsInput): MetricRow[] {
  const progress = summarizeArtifactProgress(input.artifactItems);
  const rows: MetricRow[] = [];

  rows.push({
    id: "artifact-progress",
    label: "交付物进展",
    value: `${progress.ready}/${progress.total} 就绪`
  });

  if (input.matrixSummary) {
    rows.push({
      id: "test-coverage",
      label: "测试覆盖",
      value: `${input.matrixSummary.coverage}% 覆盖 / ${input.matrixSummary.passRate}% 通过`
    });
  }

  rows.push({
    id: "risk-count",
    label: "风险项",
    value: `${input.materialRisks.length} 项`
  });

  const questions = input.iteration.changeControl?.clarificationQuestions ?? [];
  rows.push({
    id: "clarification",
    label: "澄清问题",
    value: `${questions.length} 项待确认`
  });

  const findings = input.analysisReport?.prioritizedFindings ?? [];
  const highValue = findings.filter((f) => f.priority === "P0" || f.priority === "P1");
  rows.push({
    id: "high-value",
    label: "高优发现",
    value: `${highValue.length} 项`
  });

  return rows;
}

export function buildIterationGuidance(input: IterationGuidanceInput): IterationGuidance {
  const quickActions: string[] = [];
  const checkpoints: string[] = [];
  const parts: string[] = [];

  if (input.iteration.status === "blocked") {
    checkpoints.push("当前迭代阻塞中，请先解除阻断条件");
  }

  if (input.analysisReport?.cyclePhase) {
    const phaseLabels: Record<string, string> = {
      "qa-review": "质量评审窗口",
      "clarification": "需求澄清窗口",
      "scope": "范围定义窗口",
      "scope-clarified": "范围已确认",
      "task-planning": "任务规划",
      "build-in-progress": "开发实施中",
      "ready-for-release": "准备发布",
      "testing": "测试验证窗口",
      "development": "开发实施窗口",
      "release": "发布评审窗口",
      "archive": "交付归档窗口",
    };
    checkpoints.push(`当前处于${phaseLabels[input.analysisReport.cyclePhase] ?? "进行中"}`);
  }

  const questions = input.iteration.changeControl?.clarificationQuestions ?? [];
  if (questions.length > 0) {
    parts.push(`有 ${questions.length} 个澄清问题需要对话确认`);
  }

  if (input.stateMachine.allowedTransitions.includes("review")) {
    quickActions.push("流转到评审中");
  }

  quickActions.push("上传附件并触发分析");

  if (input.matrixSummary && input.matrixSummary.failed > 0) {
    parts.push(`测试矩阵中 ${input.matrixSummary.failed} 项失败需要关注`);
  }

  if (input.materialRisks.length > 0) {
    parts.push(`${input.materialRisks.length} 项风险待处理`);
  }

  const narrative = parts.length > 0 ? `${parts.join("；")}。` : "当前迭代进展正常。";

  return { narrative, quickActions, checkpoints };
}
