"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.probeRuntimeDependencies = probeRuntimeDependencies;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
async function checkFileReadable(filePath, required) {
    const checkedAt = new Date().toISOString();
    try {
        await (0, promises_1.access)(filePath, node_fs_1.constants.R_OK);
        return { required, healthy: true, checkedAt, detail: filePath };
    }
    catch (error) {
        return {
            required,
            healthy: false,
            checkedAt,
            detail: `unreadable:${filePath};${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function checkJsonStorage(dataFile, required) {
    const checkedAt = new Date().toISOString();
    try {
        if ((0, node_fs_1.existsSync)(dataFile)) {
            await (0, promises_1.access)(dataFile, node_fs_1.constants.R_OK | node_fs_1.constants.W_OK);
            return { required, healthy: true, checkedAt, detail: dataFile };
        }
        const parent = (0, node_path_1.dirname)(dataFile);
        await (0, promises_1.access)(parent, node_fs_1.constants.W_OK);
        return { required, healthy: true, checkedAt, detail: `creatable:${dataFile}` };
    }
    catch (error) {
        return {
            required,
            healthy: false,
            checkedAt,
            detail: `json-storage-unavailable:${dataFile};${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function checkSqliteStorage(dbFile, required) {
    const checkedAt = new Date().toISOString();
    try {
        if ((0, node_fs_1.existsSync)(dbFile)) {
            await (0, promises_1.access)(dbFile, node_fs_1.constants.R_OK | node_fs_1.constants.W_OK);
            return { required, healthy: true, checkedAt, detail: dbFile };
        }
        const parent = (0, node_path_1.dirname)(dbFile);
        await (0, promises_1.access)(parent, node_fs_1.constants.W_OK);
        return { required, healthy: true, checkedAt, detail: `creatable:${dbFile}` };
    }
    catch (error) {
        return {
            required,
            healthy: false,
            checkedAt,
            detail: `sqlite-storage-unavailable:${dbFile};${error instanceof Error ? error.message : String(error)}`
        };
    }
}
async function probeRuntimeDependencies(config) {
    const required = config.dependencyRequired;
    const modelFile = await checkFileReadable(config.modelFile, required);
    const storage = config.storageBackend === "sqlite"
        ? await checkSqliteStorage(config.workspaceDbFile, required)
        : await checkJsonStorage(config.dataFile, required);
    return { modelFile, storage };
}
