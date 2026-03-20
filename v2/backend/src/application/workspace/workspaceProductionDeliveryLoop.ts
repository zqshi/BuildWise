import type {
  IterationArtifactWorkflowItem,
  IterationChangeControl,
  ProductionDeliveryLoop,
  ProductionDeliveryLoopState
} from "../../domain/workspace/types";

type MatrixSummary = {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  executed: number;
  coverage: number;
};

function findArtifact(items: IterationArtifactWorkflowItem[], id: string) {
  return items.find((item) => item.id === id) ?? null;
}

function summarizeMatrix(control: Pick<IterationChangeControl, "generatedTestMatrix">): MatrixSummary {
  const matrix = Array.isArray(control.generatedTestMatrix) ? control.generatedTestMatrix : [];
  const total = matrix.length;
  const passed = matrix.filter((item) => item.executionStatus === "passed").length;
  const failed = matrix.filter((item) => item.executionStatus === "failed").length;
  const blocked = matrix.filter((item) => item.executionStatus === "blocked").length;
  const skipped = matrix.filter((item) => item.executionStatus === "skipped").length;
  const executed = passed + failed + blocked + skipped;
  const coverage = total === 0 ? 0 : Math.round((executed / total) * 100);
  return { total, passed, failed, blocked, skipped, executed, coverage };
}

function isArtifactReady(item: IterationArtifactWorkflowItem | null) {
  return Boolean(item && item.status === "ready" && item.gateStatus !== "blocked");
}

function buildLoopResult(
  state: ProductionDeliveryLoopState,
  blockedBy: string[],
  repairActions: string[],
  evidence: string[],
  updatedAt: string
): ProductionDeliveryLoop {
  return {
    state,
    blockedBy: Array.from(new Set(blockedBy)).slice(0, 12),
    repairActions: Array.from(new Set(repairActions)).slice(0, 12),
    evidence: Array.from(new Set(evidence)).slice(0, 12),
    updatedAt
  };
}

export function deriveProductionDeliveryLoop(
  control: Pick<
    IterationChangeControl,
    | "artifactWorkflow"
    | "generatedTestMatrix"
    | "qualityArtifacts"
    | "testMatrixExecutionUpdatedAt"
    | "generatedTestMatrixUpdatedAt"
    | "lastTraceabilityCoverageScore"
  >,
  now = new Date().toISOString()
): ProductionDeliveryLoop {
  const items = Array.isArray(control.artifactWorkflow?.items) ? control.artifactWorkflow.items : [];
  const prototype = findArtifact(items, "prototype-preview");
  const architecture = findArtifact(items, "technical-architecture");
  const frontendCode = findArtifact(items, "frontend-code");
  const backendCode = findArtifact(items, "backend-code");
  const testMatrixArtifact = findArtifact(items, "test-matrix");
  const acceptanceChecklistArtifact = findArtifact(items, "acceptance-checklist");
  const matrix = summarizeMatrix(control);
  const acceptanceChecklistCount = control.qualityArtifacts?.acceptanceChecklist?.length ?? 0;
  const traceabilityCoverage = Number(control.lastTraceabilityCoverageScore || 0);

  if (!isArtifactReady(prototype)) {
    return buildLoopResult(
      "need_prototype_alignment",
      ["原型交互未确认，无法进入可投产交付。"],
      ["先完成 prototype-preview，并确认关键主流程、异常路径和状态反馈。"],
      [prototype?.summary ?? "prototype-preview 未 ready"],
      now
    );
  }

  if (!isArtifactReady(architecture)) {
    return buildLoopResult(
      "need_arch_alignment",
      ["技术架构未确认，原型到工程实现尚未对齐。"],
      ["补齐 technical-architecture，明确模块职责、数据流、接口边界和回滚点。"],
      [architecture?.summary ?? "technical-architecture 未 ready", prototype?.summary ?? "prototype-preview ready"],
      now
    );
  }

  if (!isArtifactReady(frontendCode) || !isArtifactReady(backendCode)) {
    return buildLoopResult(
      "implementing",
      ["前后端代码交付尚未达到 ready 状态。"],
      ["围绕已确认原型和技术架构继续完成 frontend-code 和 backend-code，并补齐代码路径映射。"],
      [frontendCode?.summary ?? "frontend-code 未 ready", backendCode?.summary ?? "backend-code 未 ready", architecture?.summary ?? "technical-architecture ready"],
      now
    );
  }

  if (matrix.failed > 0 || matrix.blocked > 0 || testMatrixArtifact?.gateStatus === "blocked") {
    return buildLoopResult(
      "repairing",
      [
        ...(matrix.failed > 0 ? [`存在 ${matrix.failed} 条 failed 测试用例。`] : []),
        ...(matrix.blocked > 0 ? [`存在 ${matrix.blocked} 条 blocked 测试用例。`] : []),
        ...(testMatrixArtifact?.gateStatus === "blocked" ? ["测试矩阵交付物被门禁阻断。"] : [])
      ],
      [
        "先修复 failed/blocked 用例，再重新执行完整测试矩阵。",
        "修复后同步更新 frontend-code、backend-code、test-matrix 和 acceptance-checklist 证据。"
      ],
      [
        `test-matrix coverage=${matrix.coverage}%`,
        `test-matrix executed=${matrix.executed}/${matrix.total}`,
        testMatrixArtifact?.summary || "test-matrix gate blocked"
      ],
      now
    );
  }

  if (!isArtifactReady(testMatrixArtifact) || matrix.total === 0 || matrix.coverage < 100 || acceptanceChecklistCount === 0) {
    return buildLoopResult(
      "testing",
      [
        ...(!isArtifactReady(testMatrixArtifact) ? ["测试矩阵尚未 ready。"] : []),
        ...(matrix.total === 0 ? ["尚未生成可执行测试矩阵。"] : []),
        ...(matrix.coverage < 100 ? [`测试矩阵执行覆盖率不足（${matrix.coverage}%）。`] : []),
        ...(acceptanceChecklistCount === 0 ? ["缺少验收清单，无法证明交付闭环。"] : [])
      ],
      [
        "完成 test-matrix 全量执行并同步执行结果。",
        "补齐 acceptance-checklist，确保测试和业务验收可对照。"
      ],
      [
        `test-matrix coverage=${matrix.coverage}%`,
        `test-matrix updatedAt=${control.testMatrixExecutionUpdatedAt || control.generatedTestMatrixUpdatedAt || "-"}`,
        acceptanceChecklistArtifact?.summary || `acceptance-checklist count=${acceptanceChecklistCount}`
      ],
      now
    );
  }

  return buildLoopResult(
    "ready_for_release",
    [],
    [],
    [
      prototype?.summary ?? "prototype-preview ready",
      architecture?.summary ?? "technical-architecture ready",
      frontendCode?.summary ?? "frontend-code ready",
      backendCode?.summary ?? "backend-code ready",
      `test-matrix coverage=${matrix.coverage}%`,
      `traceability coverage=${traceabilityCoverage}%`,
      `acceptance-checklist count=${acceptanceChecklistCount}`
    ],
    now
  );
}
