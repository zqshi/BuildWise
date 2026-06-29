/**
 * 发布评审按端展示纯函数（v0.29.0 T6.7）。
 *
 * 把各声明目标端的发布评审结论格式化为业务语言展示行：go 端给「通过+就绪」、
 * block 端聚合阻断项、caution 端给「有条件通过」+ reason。
 * 与后端 ReleaseReviewPerPlatformItem 结构对齐；无 perPlatform 时返回空，
 * 由组件层据此降级为整体结论展示（T3 LLM 按端评审未产出前的兼容路径）。
 */

export type ReleaseReviewPerPlatformItem = {
  platform: string;
  decision: "go" | "caution" | "block";
  reason: string;
  blockers: string[];
};

const PER_PLATFORM_DECISION_LABELS: Record<string, string> = {
  go: "通过",
  caution: "有条件通过",
  block: "阻断"
};

export type ReleaseReviewPerPlatformRow = {
  platform: string;
  decisionLabel: string;
  detail: string;
};

/** 按端格式化发布评审结论为业务语言展示行（各端 decision + 阻断项/就绪描述）。 */
export function describeReleaseReviewPerPlatform(
  perPlatform: readonly ReleaseReviewPerPlatformItem[] | undefined
): ReleaseReviewPerPlatformRow[] {
  if (!perPlatform || perPlatform.length === 0) return [];
  return perPlatform.map((item) => {
    const decisionLabel = PER_PLATFORM_DECISION_LABELS[item.decision] ?? item.decision;
    const detail =
      item.decision === "block"
        ? item.blockers.length > 0
          ? item.blockers.slice(0, 3).join("；")
          : item.reason || "存在阻断项"
        : item.reason || (item.decision === "go" ? "该端就绪" : "该端有条件就绪");
    return { platform: item.platform, decisionLabel, detail };
  });
}
