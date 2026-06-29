import { parseJsonObjectFromText, pickString, pickStringList } from './extractors';
import type { TargetPlatform } from '../../../domain/workspace/projectTypes';
import type { IterationArtifactWorkflowItem } from '../../../domain/workspace/iterationTypes';
import { summarizeCodeChangesByPlatform } from '../changeControl/codePathByPlatformOps';
import type { TestMatrixByPlatformResult } from '../changeControl/testMatrixSummaryOps';

export function parseReleaseReviewCandidate(
  content: string,
  fallbackSignals: {
    testCaseCount: number;
    p0FindingCount: number;
    unknownSignalCount: number;
    boundaryCoverage: number;
  }
) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const rollbackRaw = (parsed?.rollback ?? {}) as Record<string, unknown>;
  const signalsRaw = (parsed?.qualitySignals ?? {}) as Record<string, unknown>;
  const decisionRaw = pickString((parsed?.decision as string) || "");
  const decision: "go" | "caution" | "block" = decisionRaw === "go" || decisionRaw === "caution" || decisionRaw === "block" ? decisionRaw : "caution";
  const perPlatformRaw = Array.isArray(parsed?.perPlatform) ? (parsed.perPlatform as Array<Record<string, unknown>>) : [];
  const perPlatform = perPlatformRaw
    .map((item) => {
      const r = (item ?? {}) as Record<string, unknown>;
      const decisionRaw = pickString(r.decision || "");
      const perDecision: "go" | "caution" | "block" = decisionRaw === "go" || decisionRaw === "caution" || decisionRaw === "block" ? decisionRaw : "caution";
      return {
        platform: typeof r.platform === "string" ? r.platform.trim() : "",
        decision: perDecision,
        reason: pickString(r.reason),
        blockers: pickStringList(r.blockers, 16)
      };
    })
    .filter((item) => item.platform);
  return {
    decision,
    reason: pickString(parsed?.reason),
    score: Number.isFinite(Number(parsed?.score)) ? Math.max(0, Math.min(100, Math.round(Number(parsed?.score)))) : 0,
    blockers: pickStringList(parsed?.blockers, 16),
    releaseGates: pickStringList(parsed?.releaseGates, 16),
    recommendations: pickStringList(parsed?.recommendations, 16),
    rollback: {
      shouldRollback: Boolean(rollbackRaw.shouldRollback),
      reason: pickString(rollbackRaw.reason),
      trigger: pickString(rollbackRaw.trigger),
      actions: pickStringList(rollbackRaw.actions, 16)
    },
    qualitySignals: {
      testCaseCount: Number.isFinite(Number(signalsRaw.testCaseCount)) ? Math.max(0, Math.round(Number(signalsRaw.testCaseCount))) : fallbackSignals.testCaseCount,
      p0FindingCount: Number.isFinite(Number(signalsRaw.p0FindingCount)) ? Math.max(0, Math.round(Number(signalsRaw.p0FindingCount))) : fallbackSignals.p0FindingCount,
      unknownSignalCount: Number.isFinite(Number(signalsRaw.unknownSignalCount))
        ? Math.max(0, Math.round(Number(signalsRaw.unknownSignalCount)))
        : fallbackSignals.unknownSignalCount,
      boundaryCoverage: Number.isFinite(Number(signalsRaw.boundaryCoverage))
        ? Math.max(0, Math.min(100, Math.round(Number(signalsRaw.boundaryCoverage))))
        : fallbackSignals.boundaryCoverage
    },
    perPlatform
  };
}

export function listReleaseReviewMissingReasons(candidate: ReturnType<typeof parseReleaseReviewCandidate>, targetPlatforms?: string[]) {
  const reasons: string[] = [];
  if (!candidate.reason) reasons.push("发布评审原因缺失");
  if (candidate.blockers.length === 0 && candidate.decision === "block") reasons.push("阻断决策缺少阻断项");
  if (candidate.recommendations.length === 0) reasons.push("发布建议为空");
  if (targetPlatforms && targetPlatforms.length > 0) {
    const reviewed = new Set((candidate.perPlatform ?? []).map((p) => p.platform));
    for (const platform of targetPlatforms) {
      if (!reviewed.has(platform)) reasons.push(`目标端「${platform}」未给出按端评审结论`);
    }
  }
  return reasons;
}

// ── 目标端维度：按端聚合发布评审（v0.29.0 堵死「虚假 go」的核心规则）──

/**
 * T3: 按端评审上下文——管道阶段间传递的声明端 + 按端质量数据。
 * 含测试矩阵按端聚合（每端 coverage/passRate）+ 代码白名单按端归属（每端 ruleCount），
 * 作为 LLM 按端评审的真实依据（非编造）。由 analyzeAttachmentOp 装配，透传至评审阶段。
 */
export type ReleaseReviewPlatformContext = {
  targetPlatforms: TargetPlatform[];
  testMatrixByPlatform: TestMatrixByPlatformResult;
  codePathsByPlatform?: Record<TargetPlatform, string[]>;
};

/**
 * T3: 编造防控用按端上下文（全可选）—— synthesizeReleaseReviewOp 与 qualityAudit 两条链复用。
 * caller 装配为 ReleaseReviewPlatformContext（必填），评审函数按可选读取，缺失则不补 perPlatform（向后兼容）。
 */
export type ReleaseReviewFinalizeContext = {
  targetPlatforms?: TargetPlatform[];
  testMatrixByPlatform?: TestMatrixByPlatformResult;
  codePathsByPlatform?: Record<TargetPlatform, string[]>;
};

/** 单个目标端的发布评审结论。 */
export type ReleaseReviewPerPlatformItem = {
  platform: TargetPlatform;
  decision: "go" | "caution" | "block";
  reason: string;
  blockers: string[];
};

/** 聚合输入：项目声明的目标端集合 + 各端评审结论。 */
export type ReleaseReviewAggregateInput = {
  targetPlatforms: TargetPlatform[];
  perPlatform: ReleaseReviewPerPlatformItem[];
};

/** 聚合结果：顶层决策 + 缺失评审的端 + 顶层阻断原因。 */
export type ReleaseReviewAggregateResult = {
  decision: "go" | "caution" | "block";
  /** 声明了但 perPlatform 里缺失评审结论的端 → 视为阻断（堵「漏评某端就 go」的虚假推进）。 */
  missingPlatforms: TargetPlatform[];
  /** 顶层阻断原因（缺失端 + 各端 block 汇总，业务语言）。 */
  blockers: string[];
};

/**
 * 聚合各端发布评审为顶层决策：
 * - 任一声明端缺失评审结论 → block（虚假推进：声明多端却没逐端评审）
 * - 任一声明端 block → block
 * - 全部声明端 go → go
 * - 否则（有 caution 但无 block/缺失）→ caution
 *
 * 纯函数，零 IO，可单测。这是 publish 门禁「各端均 go 才可发布」的判定核心。
 */
export function aggregateReleaseReviewByPlatform(input: ReleaseReviewAggregateInput): ReleaseReviewAggregateResult {
  const byPlatform = new Map<TargetPlatform, ReleaseReviewPerPlatformItem>();
  for (const item of input.perPlatform) byPlatform.set(item.platform, item);
  const missingPlatforms: TargetPlatform[] = [];
  const blockers: string[] = [];
  let hasBlock = false;
  let allGo = true;
  for (const platform of input.targetPlatforms) {
    const item = byPlatform.get(platform);
    if (!item) {
      missingPlatforms.push(platform);
      blockers.push(`目标端「${platform}」未给出发布评审结论，无法确认该端可投产。`);
      hasBlock = true;
      allGo = false;
      continue;
    }
    if (item.decision === "block") {
      hasBlock = true;
      allGo = false;
      const detail = item.blockers.length > 0 ? item.blockers.slice(0, 3).join("；") : item.reason || "存在阻断项";
      blockers.push(`目标端「${platform}」阻断：${detail}`);
    } else if (item.decision !== "go") {
      allGo = false;
    }
  }
  const decision: "go" | "caution" | "block" = hasBlock ? "block" : allGo ? "go" : "caution";
  return { decision, missingPlatforms, blockers };
}

/**
 * 评估各声明目标端的交付物就绪度并聚合为顶层决策。
 *
 * 每端须有「就绪（ready）」且归属该端的交付物，否则该端 block。
 * 堵「声明多端但只产出部分端交付物就标可发布」的虚假推进。
 * 仅检查交付物归属端这一差异化维度；单端质量信号（测试覆盖等）按端分组留 v0.30.0。
 */
export function assessPlatformDeliveryReadiness(
  targetPlatforms: TargetPlatform[],
  artifactItems: IterationArtifactWorkflowItem[]
): ReleaseReviewAggregateResult {
  const readyByPlatform = new Set<TargetPlatform>();
  for (const item of artifactItems) {
    if (item.targetPlatform && item.status === "ready") readyByPlatform.add(item.targetPlatform);
  }
  const perPlatform: ReleaseReviewPerPlatformItem[] = targetPlatforms.map((platform) =>
    readyByPlatform.has(platform)
      ? { platform, decision: "go", reason: "", blockers: [] }
      : { platform, decision: "block", reason: `目标端「${platform}」尚无就绪交付物`, blockers: ["该端未产出就绪交付物"] }
  );
  return aggregateReleaseReviewByPlatform({ targetPlatforms, perPlatform });
}

/**
 * 评估各声明目标端的代码改动就绪度并聚合为顶层决策（v0.30.0 T2）。
 *
 * 某端 codePathsByPlatform 有白名单 rule（ruleCount>0）但无改动（hasChange=false）→ 该端 block
 * （声明多端但只改了部分端代码就标可发布 = 虚假推进）。ruleCount=0（该端不涉及代码）不阻断。
 * 与 assessPlatformDeliveryReadiness（交付物维度）正交，二者均过才可发布。
 *
 * 纯函数，零 IO，可单测。
 */
export function assessPlatformCodeChangeReadiness(
  changedPaths: string[],
  codePathsByPlatform: Record<TargetPlatform, string[]> | undefined,
  targetPlatforms: TargetPlatform[]
): ReleaseReviewAggregateResult {
  const { perPlatform } = summarizeCodeChangesByPlatform(changedPaths, codePathsByPlatform, targetPlatforms);
  const items: ReleaseReviewPerPlatformItem[] = perPlatform.map((p) => {
    if (p.ruleCount > 0 && !p.hasChange) {
      return {
        platform: p.platform,
        decision: "block" as const,
        reason: `目标端「${p.platform}」有 ${p.ruleCount} 条代码白名单但无改动`,
        blockers: ["该端代码路径未改动"]
      };
    }
    return { platform: p.platform, decision: "go" as const, reason: "", blockers: [] };
  });
  return aggregateReleaseReviewByPlatform({ targetPlatforms, perPlatform: items });
}

/**
 * T3: 某端是否有按端真实数据（测试用例或代码白名单）——编造防控判定。
 * 有数据端漏评须阻断，不得编造可发布结论；无数据端降级整体结论。
 */
export function hasPlatformData(platform: TargetPlatform, context: ReleaseReviewFinalizeContext): boolean {
  const tm = context.testMatrixByPlatform?.perPlatform.find((p) => p.platform === platform)?.summary;
  const hasTests = Boolean(tm && tm.total > 0);
  const codeRules = context.codePathsByPlatform?.[platform];
  const hasCode = Array.isArray(codeRules) ? codeRules.length > 0 : false;
  return hasTests || hasCode;
}

/**
 * T3: 编造防控后处理——补全 perPlatform 至覆盖所有声明端。
 * 有数据端漏评 → block；无数据端 → 降级整体 decision（不编造独立结论）。
 * 无声明端（targetPlatforms 缺失/空）→ 原样返回（向后兼容单端场景）。
 */
export function finalizeReleaseReviewPerPlatform(
  candidate: ReturnType<typeof parseReleaseReviewCandidate>,
  context: ReleaseReviewFinalizeContext
): ReturnType<typeof parseReleaseReviewCandidate> {
  if (!context.targetPlatforms || context.targetPlatforms.length === 0) return candidate;
  const reviewed = new Map((candidate.perPlatform ?? []).map((p) => [p.platform, p]));
  const perPlatform = context.targetPlatforms.map((platform) => {
    const existing = reviewed.get(platform);
    if (existing) return existing;
    if (hasPlatformData(platform, context)) {
      return { platform, decision: "block" as const, reason: `目标端「${platform}」未评审`, blockers: ["该端未评审"] };
    }
    return { platform, decision: candidate.decision, reason: "该端无按端数据，降级整体结论", blockers: [] };
  });
  return { ...candidate, perPlatform };
}
