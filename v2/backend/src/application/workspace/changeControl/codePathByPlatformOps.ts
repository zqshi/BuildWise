/**
 * codePathByPlatformOps — 代码路径按端统计（v0.30.0 T2）。
 *
 * 仿 summarizeTestMatrixByPlatform（testMatrixSummaryOps）声明端遍历模式：每声明端独立统计
 * 代码白名单 rule 数 + 已改动文件数，为端级门禁 assessPlatformCodeChangeReadiness + T3 LLM
 * 按端评审提供按端真实依据。
 *
 * 与 assertBoundaryWhitelist（越界阻断）正交：本函数只统计「该端白名单是否有改动」，
 * 不阻断 agent 改写（改 web 路径仍允许，只是不计为 ios 端完成）。
 *
 * 纯函数，零 IO。
 */
import type { TargetPlatform } from '../../../domain/workspace/projectTypes';
import { normalizeRelPath } from '../shared/common';

export type CodeChangePlatformSummary = {
  platform: TargetPlatform;
  /** 该端白名单 rule 数（codePathsByPlatform[platform] 条数）。 */
  ruleCount: number;
  /** 匹配该端白名单的 changedPath 数（路径等于 rule 或位于 rule 目录下）。 */
  changedFileCount: number;
  /** 该端是否有改动（changedFileCount > 0）。 */
  hasChange: boolean;
};

export type CodeChangeByPlatformResult = {
  perPlatform: CodeChangePlatformSummary[];
};

function isPathUnderRule(path: string, rules: string[]): boolean {
  const normalizedPath = normalizeRelPath(path);
  return rules.some((rule) => {
    // 去末尾斜杠避免 rule="ios/" 产生 "ios//" 双斜杠误判（与 assertBoundaryWhitelist 用同一 normalizeRelPath）
    const r = normalizeRelPath(rule).replace(/\/+$/, "");
    if (!r) return false;
    return normalizedPath === r || normalizedPath.startsWith(`${r}/`);
  });
}

/**
 * 按声明端统计代码改动：每端白名单 rule 数 + 匹配的 changedPath 数。
 * ruleCount>0 且 changedFileCount=0 → 该端涉及代码但未改动（端级门禁判定未完成）。
 * codePathsByPlatform 缺失/某端无路径 → 该端 ruleCount=0（不涉及代码，不阻断，向后兼容）。
 */
export function summarizeCodeChangesByPlatform(
  changedPaths: string[],
  codePathsByPlatform: Record<TargetPlatform, string[]> | undefined,
  targetPlatforms: TargetPlatform[]
): CodeChangeByPlatformResult {
  const perPlatform: CodeChangePlatformSummary[] = targetPlatforms.map((platform) => {
    const platformRules = codePathsByPlatform?.[platform];
    // 自防御：持久化数据损坏（value 非数组）时兜底空，不崩（替代单独 normalize 接入，更内聚）
    const rules = Array.isArray(platformRules) ? platformRules : [];
    const changedFileCount = changedPaths.filter((p) => isPathUnderRule(p, rules)).length;
    return { platform, ruleCount: rules.length, changedFileCount, hasChange: changedFileCount > 0 };
  });
  return { perPlatform };
}
