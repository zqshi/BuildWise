"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listIterationsOp = listIterationsOp;
exports.createIterationOp = createIterationOp;
exports.listMessagesOp = listMessagesOp;
exports.createMessageOp = createMessageOp;
exports.bindIterationCodeLinkOp = bindIterationCodeLinkOp;
exports.getIterationCodeLinkOp = getIterationCodeLinkOp;
exports.locateIterationsByCodeRefOp = locateIterationsByCodeRefOp;
exports.getIterationContextOp = getIterationContextOp;
exports.getAssessmentOp = getAssessmentOp;
exports.listAssessmentSnapshotsOp = listAssessmentSnapshotsOp;
exports.getStateMachineOp = getStateMachineOp;
exports.transitionIterationOp = transitionIterationOp;
exports.recomputeAssessmentOp = recomputeAssessmentOp;
exports.restoreSnapshotOp = restoreSnapshotOp;
const workspaceSupport_1 = require("./workspaceSupport");
const workspaceServiceCommon_1 = require("./workspaceServiceCommon");
function listIterationsOp(repo, projectId) {
    if (!(0, workspaceServiceCommon_1.hasProject)(repo, projectId)) {
        return null;
    }
    return repo.listIterations(projectId).map(workspaceSupport_1.normalizeIteration);
}
function createIterationOp(repo, projectId, payload) {
    if (!(0, workspaceServiceCommon_1.hasProject)(repo, projectId)) {
        return null;
    }
    const project = repo.findProject(projectId);
    const previous = repo.listIterations(projectId).sort((a, b) => b.id - a.id).map(workspaceSupport_1.normalizeIteration)[0] ?? null;
    const mergedPayload = (0, workspaceSupport_1.buildMergedIterationPayload)(payload, project, previous);
    const created = repo.createIteration(projectId, mergedPayload);
    const normalized = (0, workspaceSupport_1.normalizeIteration)(created);
    if (!normalized.codeLink) {
        const defaultCodeLink = (0, workspaceServiceCommon_1.buildDefaultIterationCodeLink)(repo, normalized);
        if (defaultCodeLink) {
            normalized.codeLink = defaultCodeLink;
            repo.updateIteration(normalized);
            (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_code_link_initialized", `iteration:${normalized.id}`, `${defaultCodeLink.branch}@${defaultCodeLink.commit || "HEAD"}`);
        }
    }
    const snapshot = {
        id: repo.nextId(repo.read().snapshots),
        iterationId: normalized.id,
        source: "create",
        note: "迭代创建自动快照",
        assessment: normalized.assessment,
        scope: normalized.scope,
        status: normalized.status,
        progress: normalized.progress,
        createdAt: new Date().toISOString()
    };
    repo.appendSnapshot(snapshot);
    return normalized;
}
function listMessagesOp(repo, iterationId) {
    return repo.listMessages(iterationId);
}
function createMessageOp(repo, iterationId, role, content) {
    const created = repo.createMessage(iterationId, role, content);
    const iteration = repo.findIteration(iterationId);
    if (iteration) {
        const snapshot = {
            id: repo.nextId(repo.read().snapshots),
            iterationId,
            source: "message",
            note: `${role} 消息更新`,
            assessment: iteration.assessment,
            scope: iteration.scope,
            status: iteration.status,
            progress: iteration.progress,
            createdAt: new Date().toISOString()
        };
        repo.appendSnapshot(snapshot);
    }
    return created;
}
function bindIterationCodeLinkOp(repo, iterationId, input) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    const project = repo.findProject(iteration.projectId);
    const projectRepo = project ? (0, workspaceSupport_1.normalizeProject)(project).repository : null;
    if (!projectRepo) {
        return null;
    }
    const normalizedIteration = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const slug = normalizedIteration.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `iter-${iterationId}`;
    const link = {
        repoId: projectRepo.id,
        branch: input.branch?.trim() || `iteration/${iterationId}-${slug}`,
        tag: input.tag?.trim() || (normalizedIteration.version ? `v${normalizedIteration.version}` : `iter-v${iterationId}`),
        commit: input.commit?.trim() || "",
        pr: input.pr?.trim() || "",
        paths: Array.isArray(input.paths) ? input.paths.filter((item) => item.trim()).map((item) => item.trim()) : [],
        note: input.note?.trim() || "",
        linkedAt: new Date().toISOString()
    };
    normalizedIteration.codeLink = link;
    repo.updateIteration(normalizedIteration);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_code_linked", `iteration:${iterationId}`, `${link.branch}@${link.commit || "HEAD"}`);
    return link;
}
function getIterationCodeLinkOp(repo, iterationId) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    return (0, workspaceSupport_1.normalizeIteration)(iteration).codeLink ?? null;
}
function locateIterationsByCodeRefOp(repo, projectId, ref) {
    const query = ref.trim().toLowerCase();
    if (!query) {
        return [];
    }
    return repo
        .listIterations(projectId)
        .map(workspaceSupport_1.normalizeIteration)
        .filter((item) => {
        const link = item.codeLink;
        if (!link) {
            return false;
        }
        const fields = [link.branch, link.tag, link.commit, link.pr, ...link.paths].filter(Boolean).map((value) => value.toLowerCase());
        return fields.some((value) => value.includes(query));
    })
        .map((item) => ({
        iterationId: item.id,
        iterationName: item.name,
        status: item.status,
        codeLink: item.codeLink
    }));
}
function getIterationContextOp(repo, iterationId) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const previous = repo.findPreviousIteration(normalized);
    return {
        iteration: normalized,
        previous: previous ? (0, workspaceSupport_1.normalizeIteration)(previous) : null,
        continuity: normalized.continuity,
        scope: normalized.scope
    };
}
function getAssessmentOp(repo, iterationId) {
    const iteration = repo.findIteration(iterationId);
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
function listAssessmentSnapshotsOp(repo, iterationId) {
    return repo.listSnapshots(iterationId);
}
function getStateMachineOp(repo, iterationId) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const currentStatus = normalized.status;
    return {
        iterationId: normalized.id,
        currentStatus,
        allowedTransitions: workspaceSupport_1.statusTransitions[currentStatus] || [],
        transitionHistory: repo.listTransitions(iterationId)
    };
}
function transitionIterationOp(repo, iterationId, toStatus, note = "") {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return { ok: false, reason: "iteration_not_found" };
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const fromStatus = normalized.status;
    if (fromStatus === toStatus) {
        return { ok: true, data: { iterationId, fromStatus, toStatus } };
    }
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
    repo.updateIteration(normalized);
    const createdAt = new Date().toISOString();
    repo.appendTransition({
        id: repo.nextId(repo.read().transitions),
        iterationId,
        fromStatus,
        toStatus,
        note: note || `${fromStatus} -> ${toStatus}`,
        createdAt
    });
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_state_transitioned", `iteration:${iterationId}`, `${fromStatus} -> ${toStatus}${note ? ` (${note})` : ""}`);
    repo.appendSnapshot({
        id: repo.nextId(repo.read().snapshots),
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
function recomputeAssessmentOp(repo, iterationId) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    const previous = repo.findPreviousIteration(iteration);
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    normalized.assessment = (0, workspaceSupport_1.recomputeAssessment)(normalized, previous ? (0, workspaceSupport_1.normalizeIteration)(previous) : null);
    repo.updateIteration(normalized);
    repo.appendSnapshot({
        id: repo.nextId(repo.read().snapshots),
        iterationId,
        source: "manual-recompute",
        note: "手动刷新评估",
        assessment: normalized.assessment,
        scope: normalized.scope,
        status: normalized.status,
        progress: normalized.progress,
        createdAt: new Date().toISOString()
    });
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "assessment_recomputed", `iteration:${iterationId}`, "手动刷新评估");
    return {
        iterationId,
        iterationName: normalized.name,
        assessment: normalized.assessment
    };
}
function restoreSnapshotOp(repo, iterationId, snapshotId) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    const snapshot = repo.listSnapshots(iterationId).find((item) => item.id === snapshotId);
    if (!snapshot) {
        return null;
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    normalized.assessment = snapshot.assessment;
    normalized.scope = snapshot.scope;
    normalized.status = snapshot.status;
    normalized.progress = snapshot.progress;
    repo.updateIteration(normalized);
    repo.appendSnapshot({
        id: repo.nextId(repo.read().snapshots),
        iterationId,
        source: "restore",
        note: `恢复快照 #${snapshotId}`,
        assessment: normalized.assessment,
        scope: normalized.scope,
        status: normalized.status,
        progress: normalized.progress,
        createdAt: new Date().toISOString()
    });
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "assessment_restored", `iteration:${iterationId}`, `恢复快照 #${snapshotId}`);
    return {
        iterationId,
        iterationName: normalized.name,
        assessment: normalized.assessment
    };
}
