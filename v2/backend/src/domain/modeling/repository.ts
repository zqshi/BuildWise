import type { ModelEntity, ModelRelation, ModelStore } from "./types";

export interface ModelingRepository {
  read(): ModelStore;
  write(data: ModelStore): void;
  listEntities(): ModelEntity[];
  listRelations(): ModelRelation[];
  createEntity(input: Pick<ModelEntity, "name"> & Partial<ModelEntity>): ModelEntity;
  createRelation(input: Omit<ModelRelation, "id"> & { id?: string }): ModelRelation;
  deleteRelation(relationId: string): boolean;
}
