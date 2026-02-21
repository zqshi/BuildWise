import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname } from "node:path";
import type { RuntimeConfig } from "./runtimeConfig";

export type RuntimeDependencyItem = {
  required: boolean;
  healthy: boolean;
  checkedAt: string;
  detail: string;
};

export type RuntimeDependencyStatus = {
  modelFile: RuntimeDependencyItem;
  storage: RuntimeDependencyItem;
};

async function checkFileReadable(filePath: string, required: boolean): Promise<RuntimeDependencyItem> {
  const checkedAt = new Date().toISOString();
  try {
    await access(filePath, constants.R_OK);
    return { required, healthy: true, checkedAt, detail: filePath };
  } catch (error) {
    return {
      required,
      healthy: false,
      checkedAt,
      detail: `unreadable:${filePath};${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function checkJsonStorage(dataFile: string, required: boolean): Promise<RuntimeDependencyItem> {
  const checkedAt = new Date().toISOString();
  try {
    if (existsSync(dataFile)) {
      await access(dataFile, constants.R_OK | constants.W_OK);
      return { required, healthy: true, checkedAt, detail: dataFile };
    }
    const parent = dirname(dataFile);
    await access(parent, constants.W_OK);
    return { required, healthy: true, checkedAt, detail: `creatable:${dataFile}` };
  } catch (error) {
    return {
      required,
      healthy: false,
      checkedAt,
      detail: `json-storage-unavailable:${dataFile};${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function checkSqliteStorage(dbFile: string, required: boolean): Promise<RuntimeDependencyItem> {
  const checkedAt = new Date().toISOString();
  try {
    if (existsSync(dbFile)) {
      await access(dbFile, constants.R_OK | constants.W_OK);
      return { required, healthy: true, checkedAt, detail: dbFile };
    }
    const parent = dirname(dbFile);
    await access(parent, constants.W_OK);
    return { required, healthy: true, checkedAt, detail: `creatable:${dbFile}` };
  } catch (error) {
    return {
      required,
      healthy: false,
      checkedAt,
      detail: `sqlite-storage-unavailable:${dbFile};${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export async function probeRuntimeDependencies(config: RuntimeConfig): Promise<RuntimeDependencyStatus> {
  const required = config.dependencyRequired;
  const modelFile = await checkFileReadable(config.modelFile, required);
  const storage =
    config.storageBackend === "sqlite"
      ? await checkSqliteStorage(config.workspaceDbFile, required)
      : await checkJsonStorage(config.dataFile, required);
  return { modelFile, storage };
}
