"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIterationChangeControlOp = getIterationChangeControlOp;
exports.confirmIterationAnalysisOp = confirmIterationAnalysisOp;
exports.updateIterationBoundaryOp = updateIterationBoundaryOp;
exports.updateClarificationDraftOp = updateClarificationDraftOp;
exports.updateIterationTestMatrixExecutionOp = updateIterationTestMatrixExecutionOp;
const workspaceSupport_1 = require("./workspaceSupport");
const workspaceServiceCommon_1 = require("./workspaceServiceCommon");
const allowedExecutionStatuses = new Set(["pending", "passed", "failed", "blocked", "skipped"]);
function summarizeMatrixExecution(matrix) {
    const total = matrix.length;
    const passed = matrix.filter((item) => item.executionStatus === "passed").length;
    const failed = matrix.filter((item) => item.executionStatus === "failed").length;
    const blocked = matrix.filter((item) => item.executionStatus === "blocked").length;
    const skipped = matrix.filter((item) => item.executionStatus === "skipped").length;
    const executed = passed + failed + blocked + skipped;
    const coverage = total === 0 ? 100 : Math.round((executed / total) * 100);
    const passRate = executed === 0 ? (total === 0 ? 100 : 0) : Math.round((passed / executed) * 100);
    return { total, executed, passed, failed, blocked, skipped, coverage, passRate };
}
function getIterationChangeControlOp(repo, iterationId) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    return (0, workspaceSupport_1.normalizeIteration)(iteration).changeControl ?? null;
}
function confirmIterationAnalysisOp(repo, iterationId, input) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return { ok: false, reason: "iteration_not_found" };
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const current = normalized.changeControl ?? (0, workspaceServiceCommon_1.defaultIterationChangeControl)();
    const now = new Date().toISOString();
    const note = input.note?.trim() || "";
    const resolution = (0, workspaceServiceCommon_1.resolveClarificationSelection)(Array.isArray(current?.clarificationQuestions) ? current.clarificationQuestions : [], input.resolvedClarificationQuestions ??
        (Array.isArray(current?.clarificationDraftResolvedQuestions) ? current.clarificationDraftResolvedQuestions : []), now);
    if (!input.accurate) {
        normalized.changeControl = {
            ...current,
            pendingHumanConfirmation: true,
            clarificationRounds: (current?.clarificationRounds || 0) + 1,
            clarificationQuestions: Array.isArray(current?.clarificationQuestions) ? current.clarificationQuestions : [],
            clarificationDraftResolvedQuestions: resolution.resolvedQuestions,
            clarificationDraftUpdatedAt: now,
            lastClarificationResolution: resolution,
            lastClarificationNote: note,
            confirmedAt: "",
            confirmedBy: ""
        };
        repo.updateIteration(normalized);
        (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_analysis_clarification_requested", `iteration:${iterationId}`, note || "用户要求继续澄清附件分析结果");
        return { ok: true, data: normalized.changeControl };
    }
    if (resolution.unresolvedQuestions.length > 0) {
        return {
            ok: false,
            reason: "clarification_questions_unresolved",
            unresolvedQuestions: resolution.unresolvedQuestions
        };
    }
    const boundary = input.boundary;
    normalized.changeControl = {
        ...current,
        pendingHumanConfirmation: false,
        clarificationQuestions: [],
        clarificationDraftResolvedQuestions: [],
        clarificationDraftUpdatedAt: now,
        lastClarificationResolution: resolution,
        lastClarificationNote: note,
        confirmedAt: now,
        confirmedBy: input.actor?.trim() || "human",
        boundary: {
            requirementRefs: Array.isArray(boundary?.requirementRefs)
                ? boundary.requirementRefs.map((item) => item.trim()).filter(Boolean)
                : current?.boundary.requirementRefs || [],
            componentRefs: Array.isArray(boundary?.componentRefs)
                ? boundary.componentRefs.map((item) => item.trim()).filter(Boolean)
                : current?.boundary.componentRefs || [],
            codePaths: Array.isArray(boundary?.codePaths)
                ? boundary.codePaths.map((item) => item.trim()).filter(Boolean)
                : current?.boundary.codePaths || [],
            note: boundary?.note?.trim() || current?.boundary.note || "",
            updatedAt: now
        }
    };
    repo.updateIteration(normalized);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_analysis_confirmed", `iteration:${iterationId}`, `confirmedBy=${normalized.changeControl.confirmedBy}`);
    return { ok: true, data: normalized.changeControl };
}
function updateIterationBoundaryOp(repo, iterationId, input) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const current = normalized.changeControl ?? (0, workspaceServiceCommon_1.defaultIterationChangeControl)();
    const now = new Date().toISOString();
    normalized.changeControl = {
        ...current,
        boundary: {
            requirementRefs: Array.isArray(input.requirementRefs)
                ? input.requirementRefs.map((item) => item.trim()).filter(Boolean)
                : current?.boundary.requirementRefs || [],
            componentRefs: Array.isArray(input.componentRefs)
                ? input.componentRefs.map((item) => item.trim()).filter(Boolean)
                : current?.boundary.componentRefs || [],
            codePaths: Array.isArray(input.codePaths)
                ? input.codePaths.map((item) => item.trim()).filter(Boolean)
                : current?.boundary.codePaths || [],
            note: input.note?.trim() || current?.boundary.note || "",
            updatedAt: now
        }
    };
    repo.updateIteration(normalized);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_change_boundary_updated", `iteration:${iterationId}`, normalized.changeControl?.boundary.note || "updated");
    return normalized.changeControl ?? (0, workspaceServiceCommon_1.defaultIterationChangeControl)();
}
function updateClarificationDraftOp(repo, iterationId, resolvedQuestions) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const current = normalized.changeControl ?? (0, workspaceServiceCommon_1.defaultIterationChangeControl)();
    const now = new Date().toISOString();
    const allowedQuestions = Array.isArray(current.clarificationQuestions) ? current.clarificationQuestions : [];
    const selected = Array.isArray(resolvedQuestions)
        ? resolvedQuestions.map((item) => item.trim()).filter((item) => item.length > 0)
        : [];
    const selectedSet = new Set(selected);
    const filtered = allowedQuestions.filter((item) => selectedSet.has(item));
    normalized.changeControl = {
        ...current,
        clarificationDraftResolvedQuestions: filtered,
        clarificationDraftUpdatedAt: now
    };
    repo.updateIteration(normalized);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_clarification_draft_updated", `iteration:${iterationId}`, `resolved=${filtered.length};total=${allowedQuestions.length}`);
    return normalized.changeControl;
}
function updateIterationTestMatrixExecutionOp(repo, iterationId, updates) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return { ok: false, reason: "iteration_not_found" };
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const current = normalized.changeControl ?? (0, workspaceServiceCommon_1.defaultIterationChangeControl)();
    const matrix = Array.isArray(current.generatedTestMatrix) ? current.generatedTestMatrix : [];
    if (matrix.length === 0) {
        return { ok: false, reason: "test_matrix_missing" };
    }
    const normalizedUpdates = Array.isArray(updates)
        ? updates
            .map((item) => ({
            caseId: typeof item?.caseId === "string" ? item.caseId.trim() : "",
            status: typeof item?.status === "string" ? item.status.trim().toLowerCase() : "",
            by: typeof item?.by === "string" ? item.by.trim() : "",
            note: typeof item?.note === "string" ? item.note.trim() : ""
        }))
            .filter((item) => item.caseId.length > 0)
        : [];
    if (normalizedUpdates.length === 0 || normalizedUpdates.some((item) => !allowedExecutionStatuses.has(item.status))) {
        return { ok: false, reason: "invalid_updates" };
    }
    const existingIds = new Set(matrix.map((item) => item.caseId).filter(Boolean));
    const missingCaseIds = normalizedUpdates
        .map((item) => item.caseId)
        .filter((caseId, index, arr) => arr.indexOf(caseId) === index && !existingIds.has(caseId));
    if (missingCaseIds.length > 0) {
        return { ok: false, reason: "case_not_found", missingCaseIds };
    }
    const now = new Date().toISOString();
    const updateMap = new Map(normalizedUpdates.map((item) => [item.caseId, item]));
    const updatedMatrix = matrix.map((item) => {
        const update = updateMap.get(item.caseId);
        if (!update) {
            return item;
        }
        return {
            ...item,
            executionStatus: update.status,
            executionUpdatedAt: now,
            executionBy: update.by || "qa",
            executionNote: update.note || ""
        };
    });
    normalized.changeControl = {
        ...current,
        generatedTestMatrix: updatedMatrix,
        testMatrixExecutionUpdatedAt: now
    };
    repo.updateIteration(normalized);
    const summary = summarizeMatrixExecution(updatedMatrix);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_test_matrix_execution_updated", `iteration:${iterationId}`, `updated=${normalizedUpdates.length};executed=${summary.executed};coverage=${summary.coverage};passRate=${summary.passRate}`);
    return { ok: true, data: normalized.changeControl, summary };
}
