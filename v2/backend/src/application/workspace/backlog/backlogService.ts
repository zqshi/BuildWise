import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  BacklogItem,
  BacklogItemFilter,
  CreateBacklogItemInput
} from '../../../domain/workspace/backlogTypes';
import {
  createBacklogItemOp,
  updateBacklogItemOp,
  deleteBacklogItemOp,
  assignBacklogItemsToIterationOp,
  listBacklogItemsOp
} from './backlogOps';

export class BacklogService {
  constructor(private readonly repo: WorkspaceRepository) {}

  listBacklogItems(projectId: number, filter?: BacklogItemFilter): BacklogItem[] {
    return listBacklogItemsOp(this.repo, projectId, filter);
  }

  findBacklogItem(itemId: number): BacklogItem | null {
    return this.repo.findBacklogItem(itemId);
  }

  createBacklogItem(projectId: number, input: CreateBacklogItemInput, createdBy: string): BacklogItem | null {
    return createBacklogItemOp(this.repo, projectId, input, createdBy);
  }

  updateBacklogItem(
    itemId: number,
    updates: Partial<Pick<BacklogItem, "title" | "description" | "priority" | "status" | "source" | "sourceRef" | "tags" | "iterationId">>
  ): BacklogItem | null {
    return updateBacklogItemOp(this.repo, itemId, updates);
  }

  deleteBacklogItem(itemId: number): boolean {
    return deleteBacklogItemOp(this.repo, itemId);
  }

  assignToIteration(projectId: number, itemIds: number[], iterationId: number | null) {
    return assignBacklogItemsToIterationOp(this.repo, projectId, itemIds, iterationId);
  }

  listByIteration(iterationId: number): BacklogItem[] {
    return this.repo.listBacklogItemsByIteration(iterationId);
  }
}
