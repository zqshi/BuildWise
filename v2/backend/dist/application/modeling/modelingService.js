"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelingService = void 0;
const modelingSupport_1 = require("./modelingSupport");
class ModelingService {
    constructor(modelRepo, workspaceRepo) {
        this.modelRepo = modelRepo;
        this.workspaceRepo = workspaceRepo;
    }
    writeAudit(action, resource, detail) {
        const workspace = this.workspaceRepo.read();
        this.workspaceRepo.appendAuditLog({
            id: this.workspaceRepo.nextId(workspace.auditLogs),
            actor: "system",
            action,
            resource,
            detail,
            createdAt: (0, modelingSupport_1.nowIso)()
        });
    }
    getModel() {
        const model = this.modelRepo.read();
        return {
            ...model,
            stats: {
                entities: model.entities.length,
                relations: model.relations.length,
                rules: model.rules.length,
                pages: model.pages.length,
                apis: model.apis.length
            },
            updatedAt: (0, modelingSupport_1.nowIso)()
        };
    }
    listEntities() {
        return this.modelRepo.listEntities();
    }
    listRelations() {
        return this.modelRepo.listRelations();
    }
    createEntity(input) {
        return this.modelRepo.createEntity({
            name: input.name,
            businessLabel: input.businessLabel,
            fields: Array.isArray(input.fields) ? input.fields : []
        });
    }
    createRelation(input) {
        const model = this.modelRepo.read();
        const fromExists = model.entities.some((item) => item.id === input.fromEntityId);
        const toExists = model.entities.some((item) => item.id === input.toEntityId);
        if (!fromExists || !toExists) {
            return { ok: false, reason: "entity_not_found" };
        }
        const duplicate = model.relations.some((item) => item.fromEntityId === input.fromEntityId &&
            item.toEntityId === input.toEntityId &&
            item.type === input.type);
        if (duplicate) {
            return { ok: false, reason: "relation_duplicated" };
        }
        const created = this.modelRepo.createRelation(input);
        this.writeAudit("model_relation_created", `relation:${created.id}`, `${input.fromEntityId} -> ${input.toEntityId} (${input.type})`);
        return { ok: true, value: created };
    }
    deleteRelation(relationId) {
        const deleted = this.modelRepo.deleteRelation(relationId);
        if (deleted) {
            this.writeAudit("model_relation_deleted", `relation:${relationId}`, `删除关系 ${relationId}`);
        }
        return deleted;
    }
    compileRules() {
        const model = this.modelRepo.read();
        const warnings = [];
        let validRules = 0;
        for (const rule of model.rules) {
            if (!rule || typeof rule !== "object") {
                warnings.push("检测到非法规则对象。");
                continue;
            }
            const target = typeof rule.target === "string" ? rule.target : "";
            const type = typeof rule.type === "string" ? rule.type : "";
            if (!target) {
                warnings.push(`规则 ${rule.id || "unknown"} 缺少 target。`);
            }
            if (!type) {
                warnings.push(`规则 ${rule.id || "unknown"} 缺少 type。`);
            }
            if (target && type) {
                validRules += 1;
            }
        }
        return {
            compiledAt: (0, modelingSupport_1.nowIso)(),
            ruleCount: model.rules.length,
            validRules,
            invalidRules: Math.max(0, model.rules.length - validRules),
            warnings
        };
    }
    buildSyncReport() {
        const model = this.modelRepo.read();
        const workspace = this.workspaceRepo.read();
        const projects = workspace.projects.length;
        const iterations = workspace.iterations.length;
        const entities = model.entities.length;
        const pages = model.pages.length;
        const apis = model.apis.filter((api) => typeof api.path === "string" && api.path).length;
        const compile = this.compileRules();
        const { ruleQuality, coverageScore } = (0, modelingSupport_1.calculateCoverageScores)({
            compileRuleCount: compile.ruleCount,
            compileValidRules: compile.validRules,
            iterationCount: iterations,
            entityCount: entities,
            apiCount: apis,
            pageCount: pages,
            projectCount: projects
        });
        const impacts = [];
        const risks = [];
        impacts.push(`模型实体 ${entities} 个，页面 ${pages} 个，接口 ${apis} 个。`);
        impacts.push(`项目 ${projects} 个，迭代 ${iterations} 个参与同步评分。`);
        if (compile.invalidRules > 0) {
            impacts.push(`检测到 ${compile.invalidRules} 条无效规则，可能影响自动生成稳定性。`);
            risks.push("存在未通过编译的规则，建议优先修复规则 target/type。");
        }
        if (coverageScore < 60) {
            risks.push("同步覆盖分偏低，建议补充迭代目标或减少模型冗余定义。");
        }
        if (pages === 0 || entities === 0) {
            risks.push("模型核心资产缺失，无法形成完整业务闭环。");
        }
        if (risks.length === 0) {
            risks.push("当前未发现高优先级同步风险。");
        }
        return {
            generatedAt: (0, modelingSupport_1.nowIso)(),
            projectCount: projects,
            iterationCount: iterations,
            modelEntityCount: entities,
            modelRuleCount: model.rules.length,
            modelPageCount: pages,
            coverageScore,
            summary: `项目 ${projects}，迭代 ${iterations}，实体 ${entities}，规则质量 ${(ruleQuality * 100).toFixed(0)}%。`,
            impacts,
            risks
        };
    }
    bindRules() {
        const model = this.modelRepo.read();
        const entityNames = model.entities.map((entity) => entity.name.toLowerCase());
        const bindings = model.rules.map((rule) => {
            const target = (rule.target || "").toLowerCase();
            const matchedEntities = model.entities
                .filter((entity, index) => target && (target.includes(entityNames[index]) || entityNames[index].includes(target)))
                .map((entity) => entity.name);
            const status = matchedEntities.length > 0 ? "bound" : "unbound";
            return {
                ruleId: rule.id,
                target: rule.target || "",
                matchedEntities,
                status,
                reason: status === "bound"
                    ? "已根据目标字段匹配到实体。"
                    : target
                        ? "未找到可匹配实体，请确认 target 命名。"
                        : "规则缺少 target，无法绑定。"
            };
        });
        return {
            generatedAt: (0, modelingSupport_1.nowIso)(),
            bindings
        };
    }
    buildTraceReport() {
        const model = this.modelRepo.read();
        const items = model.pages.flatMap((page) => model.apis
            .filter((api) => typeof api.path === "string" && api.path)
            .slice(0, 3)
            .map((api) => ({
            pageRoute: page.route,
            apiPath: api.path,
            relation: "page-consumes-api",
            modelRef: `page:${page.id}`,
            codeRef: `backend/interfaces/http/routes#${api.path.split("/").join("_")}`,
            intent: `页面 ${page.name} 使用接口 ${api.path}`
        })));
        return {
            generatedAt: (0, modelingSupport_1.nowIso)(),
            items
        };
    }
    listRoutes() {
        const model = this.modelRepo.read();
        return model.apis
            .filter((api) => typeof api.path === "string" && api.path)
            .map((api) => ({
            method: (0, modelingSupport_1.normalizeMethod)(api.method),
            path: api.path
        }));
    }
    describeRoadmap(path) {
        const parsed = (0, modelingSupport_1.parseRoadmapPath)(path);
        if (!parsed) {
            return null;
        }
        const model = this.modelRepo.read();
        const workspace = this.workspaceRepo.read();
        const indexToken = String(parsed.index).padStart(2, "0");
        const entityId = `entity_iteration${indexToken}`;
        const entityName = `Iteration${indexToken}`;
        const entity = model.entities.find((item) => item.id === entityId || item.name === entityName) ?? null;
        const hasStatusField = Boolean(entity?.fields?.some((field) => field.name === "status"));
        const apiDeclared = model.apis.some((item) => (0, modelingSupport_1.normalizeMethod)(item.method) === "GET" && (item.path || "") === path);
        return {
            version: `V${parsed.major}.${parsed.minor}`,
            route: path,
            stage: (0, modelingSupport_1.stageOfVersion)(parsed.index),
            goal: (0, modelingSupport_1.resolveRoadmapGoal)(parsed.index),
            generatedAt: (0, modelingSupport_1.nowIso)(),
            modelContract: {
                apiDeclared,
                entityDeclared: Boolean(entity),
                statusFieldDeclared: hasStatusField,
                entityRef: entity?.id ?? entityName
            },
            runtime: {
                routeRegistered: true,
                implementedBy: "model-route-registry",
                workspaceProjectCount: workspace.projects.length,
                workspaceIterationCount: workspace.iterations.length
            },
            recommendation: apiDeclared && entity && hasStatusField
                ? "模型契约完整，可进入前后端交互能力深化。"
                : "模型契约不完整，请先补齐 API 与 Iteration.status 字段定义。"
        };
    }
}
exports.ModelingService = ModelingService;
