import { readFileSync, writeFileSync } from "node:fs";
import type { ModelingRepository } from "../../domain/modeling/repository";
import type { ModelEntity, ModelStore } from "../../domain/modeling/types";

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

export class JsonModelRepository implements ModelingRepository {
  constructor(private readonly modelFile: string) {}

  read(): ModelStore {
    const raw = readFileSync(this.modelFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ModelStore>;
    return {
      entities: asArray<ModelEntity>(parsed.entities),
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
}
