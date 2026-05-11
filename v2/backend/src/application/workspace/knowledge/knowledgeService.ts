import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import type {
  KnowledgeEntry,
  CreateKnowledgeEntryInput,
  KnowledgeEntryFilter
} from '../../../domain/workspace/knowledgeTypes';
import type { KnowledgeGraphCache } from '../../../domain/workspace/knowledgeGraphTypes';
import {
  createKnowledgeEntryOp,
  updateKnowledgeEntryOp,
  deleteKnowledgeEntryOp,
  publishKnowledgeEntryOp,
  listKnowledgeEntriesOp,
  searchKnowledgeOp
} from './knowledgeOps';
import { generateKnowledgeGraph } from './knowledgeGraphOps';

export class KnowledgeService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null
  ) {}

  listKnowledgeEntries(projectId: number, filter?: KnowledgeEntryFilter): KnowledgeEntry[] {
    return listKnowledgeEntriesOp(this.repo, projectId, filter);
  }

  findKnowledgeEntry(entryId: number): KnowledgeEntry | null {
    return this.repo.findKnowledgeEntry(entryId);
  }

  createKnowledgeEntry(projectId: number, input: CreateKnowledgeEntryInput, createdBy: string): KnowledgeEntry | null {
    return createKnowledgeEntryOp(this.repo, projectId, input, createdBy);
  }

  updateKnowledgeEntry(
    entryId: number,
    updates: Partial<Pick<KnowledgeEntry, "title" | "content" | "category" | "groupName" | "applicableScene" | "tags" | "source" | "sourceRef" | "status" | "reviewedBy" | "iterationId">>
  ): KnowledgeEntry | null {
    return updateKnowledgeEntryOp(this.repo, entryId, updates);
  }

  deleteKnowledgeEntry(entryId: number): boolean {
    return deleteKnowledgeEntryOp(this.repo, entryId);
  }

  publishKnowledgeEntry(entryId: number, reviewedBy: string): KnowledgeEntry | null {
    return publishKnowledgeEntryOp(this.repo, entryId, reviewedBy);
  }

  searchKnowledge(projectId: number, query: string, limit = 10): KnowledgeEntry[] {
    return searchKnowledgeOp(this.repo, projectId, query, limit);
  }

  getKnowledgeGraph(projectId: number): KnowledgeGraphCache | null {
    return this.repo.getKnowledgeGraphCache(projectId);
  }

  async generateKnowledgeGraph(projectId: number): Promise<KnowledgeGraphCache> {
    const entries = this.repo.listKnowledgeEntries(projectId);
    const graphData = await generateKnowledgeGraph(this.agentRunner, entries);
    return this.repo.saveKnowledgeGraphCache(projectId, graphData, entries.length);
  }
}
