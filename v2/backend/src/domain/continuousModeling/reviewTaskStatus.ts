/**
 * reviewTaskStatus — 评审任务状态查询（v0.25.0 T2）
 *
 * 突出核心价值：发布门禁与交付门禁统一以「未解决阻断评审」计量——
 * 已解决（resolved=true）的评审不再阻断，使 candidate→publish 前须解决阻断评审、
 * 全部解决后放行。纯函数，无外部依赖，供 application 层复用，
 * 避免 blocking&&!resolved 过滤逻辑在多处重复。
 */
import type { ReviewTask } from "./types";

/** 返回未解决的阻断型评审（blocking=true 且 resolved 非 true） */
export function getUnresolvedBlockingReviews(reviewTasks: ReviewTask[]): ReviewTask[] {
  return reviewTasks.filter((task) => task.blocking && task.resolved !== true);
}
