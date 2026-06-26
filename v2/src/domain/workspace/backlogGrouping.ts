/**
 * backlogGrouping — 需求按版本分组的纯函数
 *
 * 把需求列表按归属版本分组：未归属（iterationId=null）归未分配组，
 * 归属的归对应版本组；空版本组（无需求）不返回，避免 UI 渲染空区。
 * 归属到已不存在的 iteration（已删除）的需求回落到未分配组，避免数据丢失。
 *
 * 纯函数无副作用，输入输出可被测试覆盖（TDD）。
 */

import type { BacklogItem } from "./backlogTypes";
import type { Iteration } from "./types";

/** 版本分组所需的最小迭代信息（结构子类型兼容完整 Iteration[]） */
export type BacklogIterationSummary = Pick<Iteration, "id" | "version" | "name">;

export type BacklogIterationGroup = {
  iteration: BacklogIterationSummary;
  items: BacklogItem[];
};

export type BacklogGrouping = {
  /** 未归属版本的需求（需求池） */
  unassigned: BacklogItem[];
  /** 各版本组（仅含至少 1 条需求的版本，顺序与入参 iterations 一致） */
  groups: BacklogIterationGroup[];
};

export function groupBacklogByIteration(
  items: ReadonlyArray<BacklogItem>,
  iterations: ReadonlyArray<BacklogIterationSummary>
): BacklogGrouping {
  const unassigned: BacklogItem[] = [];
  const byIteration = new Map<number, BacklogItem[]>();
  for (const iter of iterations) byIteration.set(iter.id, []);

  for (const item of items) {
    if (item.iterationId === null || item.iterationId === undefined) {
      unassigned.push(item);
      continue;
    }
    const bucket = byIteration.get(item.iterationId);
    if (bucket) {
      bucket.push(item);
    } else {
      // 归属到不存在的 iteration（已删除等），回落未分配避免丢失
      unassigned.push(item);
    }
  }

  const groups: BacklogIterationGroup[] = iterations
    .map((iteration) => ({ iteration, items: byIteration.get(iteration.id) ?? [] }))
    .filter((group) => group.items.length > 0);

  return { unassigned, groups };
}
