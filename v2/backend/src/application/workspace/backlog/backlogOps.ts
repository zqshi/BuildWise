import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  BacklogItem,
  BacklogItemFilter,
  CreateBacklogItemInput
} from '../../../domain/workspace/backlogTypes';
import { writeAuditLog } from '../shared/common';

export function createBacklogItemOp(
  repo: WorkspaceRepository,
  projectId: number,
  input: CreateBacklogItemInput,
  createdBy: string
): BacklogItem | null {
  const project = repo.findProject(projectId);
  if (!project) return null;
  if (input.iterationId) {
    const iteration = repo.findIteration(input.iterationId);
    if (!iteration || iteration.projectId !== projectId) return null;
  }
  const item = repo.createBacklogItem(projectId, input, createdBy);
  writeAuditLog(repo, "backlog_item_created", `backlog:${item.id}`, `project=${projectId} title=${item.title}`);
  return item;
}

export function updateBacklogItemOp(
  repo: WorkspaceRepository,
  itemId: number,
  updates: Partial<Pick<BacklogItem, "title" | "description" | "priority" | "status" | "source" | "sourceRef" | "tags" | "iterationId">>
): BacklogItem | null {
  const existing = repo.findBacklogItem(itemId);
  if (!existing) return null;
  if (updates.iterationId !== undefined && updates.iterationId !== null) {
    const iteration = repo.findIteration(updates.iterationId);
    if (!iteration || iteration.projectId !== existing.projectId) return null;
  }
  const updated: BacklogItem = {
    ...existing,
    title: updates.title ?? existing.title,
    description: updates.description ?? existing.description,
    priority: updates.priority ?? existing.priority,
    status: updates.status ?? existing.status,
    source: updates.source ?? existing.source,
    sourceRef: updates.sourceRef ?? existing.sourceRef,
    tags: updates.tags ?? existing.tags,
    iterationId: updates.iterationId !== undefined ? updates.iterationId : existing.iterationId
  };
  repo.updateBacklogItem(updated);
  writeAuditLog(repo, "backlog_item_updated", `backlog:${itemId}`, `title=${updated.title}`);
  return repo.findBacklogItem(itemId);
}

export function deleteBacklogItemOp(repo: WorkspaceRepository, itemId: number): boolean {
  const existing = repo.findBacklogItem(itemId);
  if (!existing) return false;
  const deleted = repo.deleteBacklogItem(itemId);
  if (deleted) {
    writeAuditLog(repo, "backlog_item_deleted", `backlog:${itemId}`, `title=${existing.title}`);
  }
  return deleted;
}

export function assignBacklogItemsToIterationOp(
  repo: WorkspaceRepository,
  projectId: number,
  itemIds: number[],
  iterationId: number | null
): { updated: number; skipped: number } {
  if (iterationId !== null) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration || iteration.projectId !== projectId) return { updated: 0, skipped: itemIds.length };
  }
  let updated = 0;
  let skipped = 0;
  for (const id of itemIds) {
    const item = repo.findBacklogItem(id);
    if (!item || item.projectId !== projectId) { skipped++; continue; }
    // 归属版本：status → planned；取消归属（拖回需求池）：仅 planned 回退为 open，
    // in-progress/done 等已进入执行/完成的状态保持不变，避免误改工作进度。
    const nextStatus = iterationId ? "planned" : (item.status === "planned" ? "open" : item.status);
    repo.updateBacklogItem({ ...item, iterationId, status: nextStatus });
    updated++;
  }
  if (updated > 0) {
    writeAuditLog(repo, "backlog_items_assigned", `project:${projectId}`, `count=${updated} iterationId=${iterationId ?? "unassigned"}`);
  }
  return { updated, skipped };
}

export function listBacklogItemsOp(
  repo: WorkspaceRepository,
  projectId: number,
  filter?: BacklogItemFilter
): BacklogItem[] {
  let items = repo.listBacklogItems(projectId);
  if (filter?.status) items = items.filter((i) => i.status === filter.status);
  if (filter?.priority) items = items.filter((i) => i.priority === filter.priority);
  if (filter?.source) items = items.filter((i) => i.source === filter.source);
  if (filter?.iterationId !== undefined) {
    items = items.filter((i) => i.iterationId === filter.iterationId);
  }
  return items;
}
