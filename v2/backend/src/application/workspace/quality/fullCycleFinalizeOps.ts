import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  IterationDeliveryPackageResult,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse,
  IterationReleaseReviewResponse
} from '../../../domain/workspace/types';
import { defaultIterationChangeControl } from '../shared/common';
import { normalizeIteration } from '../shared/workspaceSupport';

type PublishResult = {
  ok: boolean;
  reason?: string;
  message?: string;
  blockers?: string[];
};

type FinalizeParams = Parameters<typeof runFullCycleFinalizeOps>[0];

function finalizeReleaseReview(params: FinalizeParams) {
  const { repo, iterationId, response, blockers, refreshReleaseReview, getIterationReleaseReview } = params;
  if (!refreshReleaseReview) {
    response.steps.releaseReview = { status: "skipped", note: "按参数跳过发布评审刷新。" };
    return;
  }
  const releaseReview = getIterationReleaseReview(iterationId);
  response.releaseReview = releaseReview;
  if (!releaseReview) {
    response.steps.releaseReview = { status: "failed", note: "发布评审计算失败。" };
    blockers.push("发布评审计算失败");
    return;
  }
  response.steps.releaseReview = { status: "completed", note: `评审结论：${releaseReview.decision === "go" ? "允许发布" : releaseReview.decision === "caution" ? "谨慎发布" : "阻塞发布"}（${releaseReview.score} 分）` };
  const latest = repo.findIteration(iterationId);
  if (!latest) return;
  const normalized = normalizeIteration(latest);
  const current = normalized.changeControl ?? defaultIterationChangeControl();
  normalized.changeControl = {
    ...current,
    lastReleaseReviewDecision: releaseReview.decision,
    lastReleaseReviewReason: releaseReview.blockers[0] || releaseReview.warnings[0] || "",
    lastReleaseReviewBlockers: releaseReview.blockers,
    lastReleaseReviewScore: releaseReview.score,
    lastReleaseReviewUpdatedAt: releaseReview.generatedAt
  };
  repo.updateIteration(normalized);
}

async function finalizeDeliveryPackage(params: FinalizeParams) {
  const { iterationId, input, response, blockers, warnings, generateDeliveryPackage, generateIterationDeliveryPackage } = params;
  if (!generateDeliveryPackage) {
    response.steps.deliveryPackage = { status: "skipped", note: "按参数跳过交付包生成。" };
    return;
  }
  const deliveryPackage = await generateIterationDeliveryPackage(iterationId, {
    dryRun: input.deliveryPackageDryRun === true,
    releaseReview: response.releaseReview
  });
  response.deliveryPackageResult = deliveryPackage;
  if (!deliveryPackage) {
    response.steps.deliveryPackage = { status: "failed", note: "交付包生成失败。" };
    blockers.push("交付包生成失败");
    return;
  }
  response.steps.deliveryPackage = {
    status: "completed",
    note: `${deliveryPackage.dryRun ? "交付包预演完成" : "交付包已生成"}，评审报告 ${deliveryPackage.reviewReportFiles.length} 份、包文件 ${deliveryPackage.packageFiles.length} 个`
  };
  if (deliveryPackage.warnings.length > 0) warnings.push(...deliveryPackage.warnings);
}

async function finalizePublish(params: FinalizeParams) {
  const { iterationId, input, response, blockers, publishEnabled, publishIterationToRemote } = params;
  if (!publishEnabled) {
    response.steps.publish = { status: "skipped", note: "按参数跳过发布。" };
    return;
  }
  const publishResult = await publishIterationToRemote(iterationId, {
    dryRun: input.publish?.dryRun === true,
    openPr: input.publish?.openPr,
    commitMessage: input.publish?.commitMessage,
    prTitle: input.publish?.prTitle,
    prBody: input.publish?.prBody
  });
  response.publishResult = publishResult as IterationFullCycleRunResponse["publishResult"];
  if (!publishResult.ok) {
    const blockReasons = ["analysis_confirmation_required", "release_review_blocked", "boundary_violation"];
    if (blockReasons.includes(publishResult.reason || "")) {
      response.steps.publish = { status: "blocked", note: publishResult.message || publishResult.reason || "发布被阻断。" };
      blockers.push(...(publishResult.blockers || [publishResult.reason || "发布被阻断"]));
    } else {
      response.steps.publish = { status: "failed", note: publishResult.message || publishResult.reason || "发布失败。" };
      blockers.push(publishResult.reason || "发布失败");
    }
  } else {
    response.steps.publish = { status: "completed", note: `发布完成（${input.publish?.dryRun === true ? "预演模式" : "正式发布"}）` };
  }
}

export async function runFullCycleFinalizeOps(params: {
  repo: WorkspaceRepository;
  iterationId: number;
  input: IterationFullCycleRunInput;
  response: IterationFullCycleRunResponse;
  blockers: string[];
  warnings: string[];
  refreshReleaseReview: boolean;
  generateDeliveryPackage: boolean;
  publishEnabled: boolean;
  getIterationReleaseReview: (iterationId: number) => IterationReleaseReviewResponse | null;
  generateIterationDeliveryPackage: (
    iterationId: number,
    input: { dryRun?: boolean; releaseReview?: IterationReleaseReviewResponse | null }
  ) => Promise<IterationDeliveryPackageResult | null>;
  publishIterationToRemote: (
    iterationId: number,
    input: { dryRun?: boolean; openPr?: boolean; commitMessage?: string; prTitle?: string; prBody?: string }
  ) => Promise<PublishResult>;
}): Promise<void> {
  finalizeReleaseReview(params);
  await finalizeDeliveryPackage(params);
  await finalizePublish(params);
}
