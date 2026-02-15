import type { ModelEntity, ModelStore } from "./types";

export interface ModelingRepository {
  read(): ModelStore;
  write(data: ModelStore): void;
  listEntities(): ModelEntity[];
  createEntity(input: Pick<ModelEntity, "name"> & Partial<ModelEntity>): ModelEntity;
}
