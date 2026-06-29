/**
 * useProjectModelViewHelpers — useProjectModelView 的纯函数辅助
 *
 * 从 useProjectModelView 拆出的非 hook 纯逻辑，可独立单测。
 */
import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes";
import { toFriendlyName } from "./projectOverviewPanelHelpers";

/** 计算关系焦点实体（按出现频次取前 3，附计数）。 */
export function computeRelationFocusEntities(relations: ModelRelationPayload[]): string[] {
  const entityCounter = new Map<string, number>();
  for (const relation of relations) {
    entityCounter.set(relation.fromEntityId, (entityCounter.get(relation.fromEntityId) ?? 0) + 1);
    entityCounter.set(relation.toEntityId, (entityCounter.get(relation.toEntityId) ?? 0) + 1);
  }
  return Array.from(entityCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([entityId, count]) => `${toFriendlyName(entityId)}(${count})`);
}
