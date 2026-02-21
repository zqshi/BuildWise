"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = writeAuditLog;
exports.hasProject = hasProject;
exports.buildDefaultIterationCodeLink = buildDefaultIterationCodeLink;
exports.defaultIterationChangeControl = defaultIterationChangeControl;
exports.resolveClarificationSelection = resolveClarificationSelection;
exports.listProjectsNormalized = listProjectsNormalized;
exports.listIterationsNormalized = listIterationsNormalized;
const workspaceSupport_1 = require("./workspaceSupport");
function writeAuditLog(repo, action, resource, detail) {
    const data = repo.read();
    repo.appendAuditLog({
        id: repo.nextId(data.auditLogs),
        actor: "system",
        action,
        resource,
        detail,
        createdAt: new Date().toISOString()
    });
}
function hasProject(repo, projectId) {
    const project = repo.findProject(projectId);
    if (!project) {
        return false;
    }
    return !Boolean((0, workspaceSupport_1.normalizeProject)(project).deletedAt);
}
function buildDefaultIterationCodeLink(repo, iteration) {
    const project = repo.findProject(iteration.projectId);
    const repository = project ? (0, workspaceSupport_1.normalizeProject)(project).repository : null;
    if (!repository) {
        return null;
    }
    const slug = iteration.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `iter-${iteration.id}`;
    return {
        repoId: repository.id,
        branch: `iteration/${iteration.id}-${slug}`,
        tag: iteration.version ? `v${iteration.version}` : `iter-v${iteration.id}`,
        commit: "",
        pr: "",
        paths: [],
        note: "",
        linkedAt: new Date().toISOString()
    };
}
function defaultIterationChangeControl() {
    return {
        pendingHumanConfirmation: false,
        lastAnalysisAt: "",
        lastAnalysisFileName: "",
        lastAnalysisDigest: "",
        clarificationRounds: 0,
        clarificationQuestions: [],
        clarificationDraftResolvedQuestions: [],
        clarificationDraftUpdatedAt: "",
        lastClarificationResolution: {
            resolvedQuestions: [],
            unresolvedQuestions: [],
            updatedAt: ""
        },
        lastClarificationNote: "",
        confirmedAt: "",
        confirmedBy: "",
        generatedTestMatrix: [],
        generatedTestMatrixUpdatedAt: "",
        testMatrixExecutionUpdatedAt: "",
        lastAnalysisP0Count: 0,
        lastAnalysisHighValueCount: 0,
        lastAnalysisConsideredFiles: 0,
        lastAnalysisIgnoredFiles: 0,
        lastAnalysisIgnoredFileRatio: 0,
        lastReleaseReviewDecision: "",
        lastReleaseReviewReason: "",
        lastReleaseReviewBlockers: [],
        lastReleaseReviewUpdatedAt: "",
        lastTraceabilityCoverageScore: 0,
        lastOpsRollbackSuggested: false,
        boundary: {
            requirementRefs: [],
            componentRefs: [],
            codePaths: [],
            note: "",
            updatedAt: ""
        }
    };
}
function resolveClarificationSelection(allQuestions, selectedQuestions, updatedAt) {
    const selectedSet = new Set(Array.isArray(selectedQuestions) ? selectedQuestions.map((item) => item.trim()).filter(Boolean) : []);
    const resolvedQuestions = allQuestions.filter((item) => selectedSet.has(item));
    const unresolvedQuestions = allQuestions.filter((item) => !selectedSet.has(item));
    return {
        resolvedQuestions,
        unresolvedQuestions,
        updatedAt
    };
}
function listProjectsNormalized(repo) {
    return repo
        .listProjects()
        .map(workspaceSupport_1.normalizeProject)
        .filter((project) => !project.deletedAt);
}
function listIterationsNormalized(repo, projectId) {
    if (!hasProject(repo, projectId)) {
        return null;
    }
    return repo.listIterations(projectId).map(workspaceSupport_1.normalizeIteration);
}
