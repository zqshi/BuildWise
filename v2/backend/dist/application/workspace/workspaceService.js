"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
const workspaceSupport_1 = require("./workspaceSupport");
class WorkspaceService {
    constructor(repo) {
        this.repo = repo;
    }
    listGovernanceRoles() {
        return [
            { id: "owner", name: "系统负责人", permissions: ["workspace:*", "model:*", "governance:*"] },
            { id: "pm", name: "产品经理", permissions: ["workspace:read", "workspace:write", "iteration:transition"] },
            { id: "developer", name: "研发工程师", permissions: ["workspace:read", "model:read", "model:write"] },
            { id: "qa", name: "测试工程师", permissions: ["workspace:read", "trace:read", "assessment:recompute"] },
            { id: "viewer", name: "只读成员", permissions: ["workspace:read", "model:read"] }
        ];
    }
    listAuditLogs(limit = 50) {
        return this.repo.listAuditLogs(limit);
    }
    writeAuditLog(action, resource, detail) {
        const data = this.repo.read();
        this.repo.appendAuditLog({
            id: this.repo.nextId(data.auditLogs),
            actor: "system",
            action,
            resource,
            detail,
            createdAt: new Date().toISOString()
        });
    }
    hasProject(projectId) {
        return this.repo.findProject(projectId) !== null;
    }
    listProjects() {
        return this.repo.listProjects();
    }
    createProject(input) {
        return this.repo.createProject(input);
    }
    listIterations(projectId) {
        if (!this.hasProject(projectId)) {
            return null;
        }
        return this.repo.listIterations(projectId).map(workspaceSupport_1.normalizeIteration);
    }
    createIteration(projectId, payload) {
        if (!this.hasProject(projectId)) {
            return null;
        }
        const created = this.repo.createIteration(projectId, payload);
        const normalized = (0, workspaceSupport_1.normalizeIteration)(created);
        const snapshot = {
            id: this.repo.nextId(this.repo.read().snapshots),
            iterationId: normalized.id,
            source: "create",
            note: "迭代创建自动快照",
            assessment: normalized.assessment,
            scope: normalized.scope,
            status: normalized.status,
            progress: normalized.progress,
            createdAt: new Date().toISOString()
        };
        this.repo.appendSnapshot(snapshot);
        return normalized;
    }
    listMessages(iterationId) {
        return this.repo.listMessages(iterationId);
    }
    createMessage(iterationId, role, content) {
        const created = this.repo.createMessage(iterationId, role, content);
        const iteration = this.repo.findIteration(iterationId);
        if (iteration) {
            const snapshot = {
                id: this.repo.nextId(this.repo.read().snapshots),
                iterationId,
                source: "message",
                note: `${role} 消息更新`,
                assessment: iteration.assessment,
                scope: iteration.scope,
                status: iteration.status,
                progress: iteration.progress,
                createdAt: new Date().toISOString()
            };
            this.repo.appendSnapshot(snapshot);
        }
        return created;
    }
    getIterationContext(iterationId) {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return null;
        }
        const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
        const previous = this.repo.findPreviousIteration(normalized);
        return {
            iteration: normalized,
            previous: previous ? (0, workspaceSupport_1.normalizeIteration)(previous) : null,
            continuity: normalized.continuity,
            scope: normalized.scope
        };
    }
    getAssessment(iterationId) {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return null;
        }
        const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
        return {
            iterationId: normalized.id,
            iterationName: normalized.name,
            assessment: normalized.assessment
        };
    }
    listAssessmentSnapshots(iterationId) {
        return this.repo.listSnapshots(iterationId);
    }
    getStateMachine(iterationId) {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return null;
        }
        const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
        const currentStatus = normalized.status;
        return {
            iterationId: normalized.id,
            currentStatus,
            allowedTransitions: workspaceSupport_1.statusTransitions[currentStatus] || [],
            transitionHistory: this.repo.listTransitions(iterationId)
        };
    }
    transitionIteration(iterationId, toStatus, note = "") {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return { ok: false, reason: "iteration_not_found" };
        }
        const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
        const fromStatus = normalized.status;
        const allowed = workspaceSupport_1.statusTransitions[fromStatus] || [];
        if (!allowed.includes(toStatus)) {
            return { ok: false, reason: "invalid_transition" };
        }
        normalized.status = toStatus;
        if (toStatus === "completed") {
            normalized.progress = 100;
        }
        else if (toStatus === "in-progress" && normalized.progress === 0) {
            normalized.progress = 10;
        }
        this.repo.updateIteration(normalized);
        const createdAt = new Date().toISOString();
        this.repo.appendTransition({
            id: this.repo.nextId(this.repo.read().transitions),
            iterationId,
            fromStatus,
            toStatus,
            note: note || `${fromStatus} -> ${toStatus}`,
            createdAt
        });
        this.writeAuditLog("iteration_state_transitioned", `iteration:${iterationId}`, `${fromStatus} -> ${toStatus}${note ? ` (${note})` : ""}`);
        this.repo.appendSnapshot({
            id: this.repo.nextId(this.repo.read().snapshots),
            iterationId,
            source: "state-transition",
            note: `状态迁移 ${fromStatus} -> ${toStatus}`,
            assessment: normalized.assessment,
            scope: normalized.scope,
            status: normalized.status,
            progress: normalized.progress,
            createdAt
        });
        return { ok: true, data: { iterationId, fromStatus, toStatus } };
    }
    recomputeAssessment(iterationId) {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return null;
        }
        const previous = this.repo.findPreviousIteration(iteration);
        const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
        normalized.assessment = (0, workspaceSupport_1.recomputeAssessment)(normalized, previous ? (0, workspaceSupport_1.normalizeIteration)(previous) : null);
        this.repo.updateIteration(normalized);
        this.repo.appendSnapshot({
            id: this.repo.nextId(this.repo.read().snapshots),
            iterationId,
            source: "manual-recompute",
            note: "手动刷新评估",
            assessment: normalized.assessment,
            scope: normalized.scope,
            status: normalized.status,
            progress: normalized.progress,
            createdAt: new Date().toISOString()
        });
        this.writeAuditLog("assessment_recomputed", `iteration:${iterationId}`, "手动刷新评估");
        return {
            iterationId,
            iterationName: normalized.name,
            assessment: normalized.assessment
        };
    }
    restoreSnapshot(iterationId, snapshotId) {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return null;
        }
        const snapshot = this.repo.listSnapshots(iterationId).find((item) => item.id === snapshotId);
        if (!snapshot) {
            return null;
        }
        const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
        normalized.assessment = snapshot.assessment;
        normalized.scope = snapshot.scope;
        normalized.status = snapshot.status;
        normalized.progress = snapshot.progress;
        this.repo.updateIteration(normalized);
        this.repo.appendSnapshot({
            id: this.repo.nextId(this.repo.read().snapshots),
            iterationId,
            source: "restore",
            note: `恢复快照 #${snapshotId}`,
            assessment: normalized.assessment,
            scope: normalized.scope,
            status: normalized.status,
            progress: normalized.progress,
            createdAt: new Date().toISOString()
        });
        this.writeAuditLog("assessment_restored", `iteration:${iterationId}`, `恢复快照 #${snapshotId}`);
        return {
            iterationId,
            iterationName: normalized.name,
            assessment: normalized.assessment
        };
    }
    analyzeAttachment(iterationId, input) {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return null;
        }
        const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
        const previous = this.repo.findPreviousIteration(normalized);
        const previousScope = previous?.scope.inScope ?? [];
        const currentScope = normalized.scope.inScope;
        const added = currentScope.filter((item) => !previousScope.includes(item));
        const removed = previousScope.filter((item) => !currentScope.includes(item));
        const changed = normalized.assessment.deltaInScope.filter((item) => item.startsWith("+") || item.startsWith("-"));
        const inferredRisks = (0, workspaceSupport_1.inferRisksFromExcerpt)(input.excerpt);
        this.writeAuditLog("attachment_analyzed", `iteration:${iterationId}`, `分析附件 ${input.fileName}`);
        return {
            iterationId: normalized.id,
            iterationName: normalized.name,
            fileName: input.fileName,
            analyzedAt: new Date().toISOString(),
            understanding: `${(0, workspaceSupport_1.summarizeFromExcerpt)(input.excerpt, `已基于附件 ${input.fileName} 与当前迭代上下文完成语义理解。`)} 识别到 ${added.length} 项新增范围、${removed.length} 项移出范围。`,
            versionDiff: {
                baselineIterationName: previous?.name ?? "无基线",
                added,
                changed,
                removed
            },
            risks: normalized.assessment.risks.length > 0
                ? normalized.assessment.risks
                : inferredRisks.length > 0
                    ? inferredRisks
                    : ["暂无显式风险，请结合业务验收继续确认。"],
            suggestions: [
                "优先处理新增范围中的高业务价值项。",
                "将差异项同步到验收标准，避免交付偏差。",
                "评估被移出范围是否影响当前里程碑承诺。"
            ]
        };
    }
}
exports.WorkspaceService = WorkspaceService;
