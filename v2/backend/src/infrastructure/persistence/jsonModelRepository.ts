import { readFileSync, writeFileSync } from "node:fs";
import type { ModelingRepository } from "../../domain/modeling/repository";
import type { ModelEntity, ModelRelation, ModelStore } from "../../domain/modeling/types";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function makeEntityId(name: string) {
  const token = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `entity_${token || Date.now()}`;
}

function makeRelationId(input: { fromEntityId: string; toEntityId: string; type: string }) {
  return `relation_${input.fromEntityId}_${input.type}_${input.toEntityId}`;
}

/**
 * @deprecated 旧模型存储，将被 ContinuousModelingRepository + ModelSnapshot 体系替代。
 * 保留兼容性，不再新增功能。新的模型数据通过 /api/projects/:id/model-view 统一视图获取。
 */
export class JsonModelRepository implements ModelingRepository {
  private readonly modelFile: string;
  constructor(modelFile: string) {
    this.modelFile = modelFile;
  }

  read(): ModelStore {
    const raw = readFileSync(this.modelFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ModelStore>;
    return {
      entities: asArray<ModelEntity>(parsed.entities),
      relations: asArray<ModelRelation>(parsed.relations),
      rules: asArray(parsed.rules),
      pages: asArray(parsed.pages),
      apis: asArray(parsed.apis)
    };
  }

  write(data: ModelStore) {
    writeFileSync(this.modelFile, JSON.stringify(data, null, 2), "utf-8");
  }

  listEntities() {
    return this.read().entities;
  }

  listRelations(projectId?: number) {
    const relations = this.read().relations;
    if (typeof projectId === "number" && projectId > 0) {
      return relations.filter((item) => item.projectId === projectId);
    }
    return relations;
  }

  createEntity(input: Pick<ModelEntity, "name"> & Partial<ModelEntity>) {
    const data = this.read();
    const created: ModelEntity = {
      id: input.id || makeEntityId(input.name),
      name: input.name,
      businessLabel: input.businessLabel || input.name,
      fields: Array.isArray(input.fields) ? input.fields : []
    };
    data.entities.push(created);
    this.write(data);
    return created;
  }

  createRelation(input: Omit<ModelRelation, "id"> & { id?: string }) {
    const data = this.read();
    const created: ModelRelation = {
      id: input.id || makeRelationId(input),
      projectId: input.projectId,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      type: input.type,
      name: input.name
    };
    data.relations.push(created);
    this.write(data);
    return created;
  }

  deleteRelation(relationId: string, projectId?: number) {
    const data = this.read();
    const before = data.relations.length;
    data.relations = data.relations.filter((item) => {
      if (item.id !== relationId) {
        return true;
      }
      if (typeof projectId === "number" && projectId > 0 && item.projectId !== projectId) {
        return true;
      }
      return false;
    });
    const changed = before !== data.relations.length;
    if (changed) {
      this.write(data);
    }
    return changed;
  }
}
