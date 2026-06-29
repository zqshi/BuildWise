/**
 * testMatrixSummaryOps — 测试矩阵按端聚合（v0.30.0 T1）。
 *
 * 仿 aggregateReleaseReviewByPlatform（releaseReviewOps）声明端遍历模式：每声明端独立聚合
 * coverage/passRate，为前端按端展示 + T3 LLM 按端评审提供按端真实依据。
 * 复用 summarizeMatrixExecution（展示语义：total=0 → coverage 100「无用例=无遗漏」）。
 *
 * 注意：不合并 qualityOps.summarizeMatrix —— 该函数 total=0 → coverage 0 是有意的，
 * 参与 releaseReview penalty（qualityOps.ts:154 Math.max(s.coverage, tc)），惩罚「无测试」。
 * 二者兜底语义不同（penalty vs 展示），合并会回归 score 计算。
 *
 * 纯函数，零 IO。
 */
import type { TargetPlatform } from '../../../domain/workspace/projectTypes';
import { summarizeMatrixExecution, type MatrixSummary } from './artifactWorkflow';

export type TestMatrixPlatformSummary = {
  platform: TargetPlatform;
  summary: MatrixSummary;
};

export type TestMatrixByPlatformResult = {
  overall: MatrixSummary;
  perPlatform: TestMatrixPlatformSummary[];
};

/**
 * 按声明端聚合测试矩阵：每端独立 coverage/passRate + 顶层 overall 汇总。
 * 用例按其 targetPlatform 归入该端；声明端无用例 → 该端 total=0（coverage 100 兜底）。
 * 用例归属端不在声明集合时计入 overall 但不进任何 perPlatform。
 */
export function summarizeTestMatrixByPlatform(
  matrix: Array<{ executionStatus?: string; targetPlatform?: TargetPlatform }>,
  targetPlatforms: TargetPlatform[]
): TestMatrixByPlatformResult {
  const overall = summarizeMatrixExecution(matrix);
  const perPlatform: TestMatrixPlatformSummary[] = targetPlatforms.map((platform) => ({
    platform,
    summary: summarizeMatrixExecution(matrix.filter((item) => item.targetPlatform === platform))
  }));
  return { overall, perPlatform };
}
