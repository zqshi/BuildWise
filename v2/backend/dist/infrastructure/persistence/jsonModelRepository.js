"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonModelRepository = void 0;
const node_fs_1 = require("node:fs");
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function makeEntityId(name) {
    const token = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `entity_${token || Date.now()}`;
}
class JsonModelRepository {
    constructor(modelFile) {
        this.modelFile = modelFile;
    }
    read() {
        const raw = (0, node_fs_1.readFileSync)(this.modelFile, "utf-8");
        const parsed = JSON.parse(raw);
        return {
            entities: asArray(parsed.entities),
            rules: asArray(parsed.rules),
            pages: asArray(parsed.pages),
            apis: asArray(parsed.apis)
        };
    }
    write(data) {
        (0, node_fs_1.writeFileSync)(this.modelFile, JSON.stringify(data, null, 2), "utf-8");
    }
    listEntities() {
        return this.read().entities;
    }
    createEntity(input) {
        const data = this.read();
        const created = {
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
exports.JsonModelRepository = JsonModelRepository;
