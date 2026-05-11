import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  KnowledgeEntry,
  CreateKnowledgeEntryInput,
  KnowledgeEntryFilter
} from '../../../domain/workspace/knowledgeTypes';
import { writeAuditLog } from '../shared/common';

export function createKnowledgeEntryOp(
  repo: WorkspaceRepository,
  projectId: number,
  input: CreateKnowledgeEntryInput,
  createdBy: string
): KnowledgeEntry | null {
  const project = repo.findProject(projectId);
  if (!project) return null;
  if (input.iterationId) {
    const iteration = repo.findIteration(input.iterationId);
    if (!iteration || iteration.projectId !== projectId) return null;
  }
  const entry = repo.createKnowledgeEntry(projectId, input, createdBy);
  writeAuditLog(repo, "knowledge_entry_created", `knowledge:${entry.id}`, `project=${projectId} title=${entry.title}`);
  return entry;
}

export function updateKnowledgeEntryOp(
  repo: WorkspaceRepository,
  entryId: number,
  updates: Partial<Pick<KnowledgeEntry, "title" | "content" | "category" | "groupName" | "applicableScene" | "tags" | "source" | "sourceRef" | "status" | "reviewedBy" | "iterationId">>
): KnowledgeEntry | null {
  const existing = repo.findKnowledgeEntry(entryId);
  if (!existing) return null;
  const updated: KnowledgeEntry = {
    ...existing,
    title: updates.title ?? existing.title,
    content: updates.content ?? existing.content,
    category: updates.category ?? existing.category,
    groupName: updates.groupName ?? existing.groupName,
    applicableScene: updates.applicableScene ?? existing.applicableScene,
    tags: updates.tags ?? existing.tags,
    source: updates.source ?? existing.source,
    sourceRef: updates.sourceRef ?? existing.sourceRef,
    status: updates.status ?? existing.status,
    reviewedBy: updates.reviewedBy ?? existing.reviewedBy,
    iterationId: updates.iterationId !== undefined ? updates.iterationId : existing.iterationId
  };
  repo.updateKnowledgeEntry(updated);
  writeAuditLog(repo, "knowledge_entry_updated", `knowledge:${entryId}`, `title=${updated.title}`);
  return repo.findKnowledgeEntry(entryId);
}

export function deleteKnowledgeEntryOp(repo: WorkspaceRepository, entryId: number): boolean {
  const existing = repo.findKnowledgeEntry(entryId);
  if (!existing) return false;
  const deleted = repo.deleteKnowledgeEntry(entryId);
  if (deleted) {
    writeAuditLog(repo, "knowledge_entry_deleted", `knowledge:${entryId}`, `title=${existing.title}`);
  }
  return deleted;
}

export function publishKnowledgeEntryOp(
  repo: WorkspaceRepository,
  entryId: number,
  reviewedBy: string
): KnowledgeEntry | null {
  const existing = repo.findKnowledgeEntry(entryId);
  if (!existing || existing.status === "archived") return null;
  return updateKnowledgeEntryOp(repo, entryId, { status: "published", reviewedBy });
}

export function listKnowledgeEntriesOp(
  repo: WorkspaceRepository,
  projectId: number,
  filter?: KnowledgeEntryFilter
): KnowledgeEntry[] {
  if (filter?.q) {
    return repo.searchKnowledgeEntries(projectId, filter.q).filter((entry) => {
      if (filter.category && entry.category !== filter.category) return false;
      if (filter.status && entry.status !== filter.status) return false;
      if (filter.source && entry.source !== filter.source) return false;
      return true;
    });
  }
  let entries = repo.listKnowledgeEntries(projectId);
  if (filter?.category) entries = entries.filter((e) => e.category === filter.category);
  if (filter?.status) entries = entries.filter((e) => e.status === filter.status);
  if (filter?.source) entries = entries.filter((e) => e.source === filter.source);
  return entries;
}

export function searchKnowledgeOp(
  repo: WorkspaceRepository,
  projectId: number,
  query: string,
  limit = 10
): KnowledgeEntry[] {
  return repo.searchKnowledgeEntries(projectId, query, limit);
}
