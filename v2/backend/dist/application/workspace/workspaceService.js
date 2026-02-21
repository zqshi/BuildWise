"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
const workspaceServiceGovernanceOps_1 = require("./workspaceServiceGovernanceOps");
const workspaceServiceProjectOps_1 = require("./workspaceServiceProjectOps");
const workspaceServiceIterationFlowOps_1 = require("./workspaceServiceIterationFlowOps");
const workspaceServiceChangeControlOps_1 = require("./workspaceServiceChangeControlOps");
const workspaceServiceAnalysisOps_1 = require("./workspaceServiceAnalysisOps");
const workspaceServiceCoachOps_1 = require("./workspaceServiceCoachOps");
const workspaceServiceVisualEditOps_1 = require("./workspaceServiceVisualEditOps");
const workspaceServiceCommon_1 = require("./workspaceServiceCommon");
const workspaceServiceCommon_2 = require("./workspaceServiceCommon");
function readPositiveInt(value, fallback) {
    const parsed = Number.parseInt((value || "").trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function countInputFiles(input) {
    if (input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0) {
        return input.files.length;
    }
    return 1;
}
function summarizeInput(input) {
    const totalFiles = countInputFiles(input);
    const totalBytes = input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
        ? input.files.reduce((total, item) => total + (Number.isFinite(item.size) ? item.size : 0), 0)
        : Number.isFinite(input.size)
            ? input.size
            : 0;
    return {
        fileName: input.fileName,
        sourceType: input.sourceType === "folder" ? "folder" : "single-file",
        folderName: input.folderName?.trim() || "",
        totalFiles,
        totalBytes
    };
}
function splitAttachmentInputIntoBatches(input, maxBatchFiles) {
    if (input.sourceType !== "folder" || !Array.isArray(input.files) || input.files.length <= maxBatchFiles) {
        return [input];
    }
    const files = input.files;
    const batches = [];
    const totalBatches = Math.ceil(files.length / maxBatchFiles);
    for (let index = 0; index < totalBatches; index += 1) {
        const batchFiles = files.slice(index * maxBatchFiles, (index + 1) * maxBatchFiles);
        const digestBase = (input.excerptDigest || "").trim();
        const digest = digestBase
            ? `${digestBase};batch=${index + 1}/${totalBatches};batchFiles=${batchFiles.length}`
            : `strategy=folder-batch;batch=${index + 1}/${totalBatches};batchFiles=${batchFiles.length}`;
        const batchPreview = batchFiles
            .filter((item) => item.excerpt.trim().length > 0)
            .slice(0, 3)
            .map((item) => `${item.path || item.fileName}: ${item.excerpt.slice(0, 180)}`)
            .join("\n\n");
        batches.push({
            ...input,
            excerpt: (batchPreview || input.excerpt || "").slice(0, 6000),
            excerptDigest: digest,
            excerptStrategy: "folder-batch",
            files: batchFiles
        });
    }
    return batches;
}
function rankProjectConfidence(value) {
    if (value === "high")
        return 3;
    if (value === "medium")
        return 2;
    return 1;
}
function mergeAttachmentReports(input, reports, totalBatches) {
    if (reports.length === 1) {
        return reports[0];
    }
    const primary = reports[reports.length - 1];
    const bestProjectDetection = reports.reduce((best, current) => {
        const bestScore = rankProjectConfidence(best.projectDetection.confidence) * 10 + best.projectDetection.evidence.length;
        const currentScore = rankProjectConfidence(current.projectDetection.confidence) * 10 + current.projectDetection.evidence.length;
        return currentScore > bestScore ? current : best;
    }, primary);
    const fileStats = input.sourceType === "folder" && Array.isArray(input.files)
        ? {
            totalFiles: input.files.length,
            textFiles: input.files.filter((item) => item.excerpt.trim().length > 0).length,
            binaryFiles: input.files.filter((item) => item.excerpt.trim().length === 0).length
        }
        : primary.fileStats;
    const fileSelection = input.sourceType === "folder" && Array.isArray(input.files)
        ? {
            consideredFiles: input.files.length,
            includedFiles: input.files.length,
            skippedNoiseFiles: reports.reduce((total, item) => total + item.fileSelection.skippedNoiseFiles, 0),
            skippedEmptyFiles: reports.reduce((total, item) => total + item.fileSelection.skippedEmptyFiles, 0),
            sampled: reports.some((item) => item.fileSelection.sampled),
            sampleReason: reports.map((item) => item.fileSelection.sampleReason).find(Boolean) || "",
            includedPaths: Array.from(new Set(reports.flatMap((item) => item.fileSelection.includedPaths))).slice(0, 12),
            ignoredFiles: Array.from(new Map(reports
                .flatMap((item) => item.fileSelection.ignoredFiles)
                .map((item) => [`${item.path}:${item.reason}`, item])).values()).slice(0, 20)
        }
        : primary.fileSelection;
    return {
        ...primary,
        fileName: input.fileName,
        sourceType: input.sourceType === "folder" ? "folder" : "single-file",
        analyzedTarget: input.sourceType === "folder" ? input.folderName?.trim() || input.fileName : input.fileName,
        analyzedAt: new Date().toISOString(),
        fileStats,
        fileSelection,
        projectDetection: {
            ...bestProjectDetection.projectDetection,
            evidence: Array.from(new Set(reports.flatMap((item) => item.projectDetection.evidence))).slice(0, 6)
        },
        meaningfulFindings: Array.from(new Set(reports.flatMap((item) => item.meaningfulFindings))).slice(0, 16),
        prioritizedFindings: Array.from(new Map(reports.flatMap((item) => item.prioritizedFindings).map((item) => [`${item.priority}:${item.content}`, item])).values()).slice(0, 16),
        nextActions: Array.from(new Set(reports.flatMap((item) => item.nextActions))).slice(0, 14),
        clarificationQuestions: Array.from(new Set(reports.flatMap((item) => item.clarificationQuestions))).slice(0, 12),
        suggestions: Array.from(new Set(reports.flatMap((item) => item.suggestions))).slice(0, 14),
        llmContext: {
            ...primary.llmContext,
            strategy: "folder-batch-job",
            digest: `strategy=folder-batch-job;batches=${totalBatches};mergedReports=${reports.length}`,
            excerptLength: reports.reduce((total, item) => total + item.llmContext.excerptLength, 0),
            chunkCount: reports.reduce((total, item) => total + item.llmContext.chunkCount, 0),
            promptContextLength: reports.reduce((total, item) => total + item.llmContext.promptContextLength, 0),
            agentCount: reports.reduce((total, item) => total + item.llmContext.agentCount, 0),
            unknownSignalCount: reports.reduce((total, item) => total + item.llmContext.unknownSignalCount, 0),
            degraded: reports.some((item) => item.llmContext.degraded),
            degradeReason: reports
                .map((item) => item.llmContext.degradeReason)
                .filter((item) => item.trim().length > 0)
                .join(" | ")
                .slice(0, 300) || ""
        },
        understanding: `${primary.understanding}（分批汇总：${reports.length}/${totalBatches}）`,
        agentOutputs: reports.flatMap((item) => item.agentOutputs).slice(0, 60)
    };
}
class WorkspaceService {
    constructor(repo, agentRunner = null) {
        this.repo = repo;
        this.agentRunner = agentRunner;
        this.analysisJobs = new Map();
        this.analysisQueue = [];
        this.runningAnalysisWorkers = 0;
        const processEnv = globalThis.process?.env ?? {};
        this.analysisWorkerConcurrency = readPositiveInt(processEnv.ANALYSIS_JOB_CONCURRENCY, 2);
        this.analysisBatchFileLimit = readPositiveInt(processEnv.ANALYSIS_JOB_BATCH_FILE_LIMIT, 50);
        this.analysisBatchRetryLimit = readPositiveInt(processEnv.ANALYSIS_JOB_BATCH_RETRY_LIMIT, 2);
    }
    listGovernanceRoles() {
        return (0, workspaceServiceGovernanceOps_1.listGovernanceRolesOp)();
    }
    listAuditLogs(limit = 50) {
        return (0, workspaceServiceGovernanceOps_1.listAuditLogsOp)(this.repo, limit);
    }
    hasProject(projectId) {
        return (0, workspaceServiceCommon_1.hasProject)(this.repo, projectId);
    }
    listProjects() {
        return (0, workspaceServiceCommon_1.listProjectsNormalized)(this.repo);
    }
    createProject(input) {
        return (0, workspaceServiceProjectOps_1.createProjectOp)(this.repo, input);
    }
    archiveProject(projectId) {
        return (0, workspaceServiceProjectOps_1.archiveProjectOp)(this.repo, projectId);
    }
    getProjectRepository(projectId) {
        return (0, workspaceServiceProjectOps_1.getProjectRepositoryOp)(this.repo, projectId);
    }
    bootstrapProjectRepository(projectId, input) {
        return (0, workspaceServiceProjectOps_1.bootstrapProjectRepositoryOp)(this.repo, projectId, input);
    }
    provisionProjectRepository(projectId, input) {
        return (0, workspaceServiceProjectOps_1.provisionProjectRepositoryOp)(this.repo, projectId, input);
    }
    scaffoldProjectRepository(projectId, input) {
        return (0, workspaceServiceProjectOps_1.scaffoldProjectRepositoryOp)(this.repo, projectId, input);
    }
    publishIterationToRemote(iterationId, input) {
        return (0, workspaceServiceProjectOps_1.publishIterationToRemoteOp)(this.repo, iterationId, input);
    }
    listIterations(projectId) {
        return (0, workspaceServiceIterationFlowOps_1.listIterationsOp)(this.repo, projectId);
    }
    createIteration(projectId, payload) {
        return (0, workspaceServiceIterationFlowOps_1.createIterationOp)(this.repo, projectId, payload);
    }
    listMessages(iterationId) {
        return (0, workspaceServiceIterationFlowOps_1.listMessagesOp)(this.repo, iterationId);
    }
    createMessage(iterationId, role, content) {
        return (0, workspaceServiceIterationFlowOps_1.createMessageOp)(this.repo, iterationId, role, content);
    }
    bindIterationCodeLink(iterationId, input) {
        return (0, workspaceServiceIterationFlowOps_1.bindIterationCodeLinkOp)(this.repo, iterationId, input);
    }
    getIterationCodeLink(iterationId) {
        return (0, workspaceServiceIterationFlowOps_1.getIterationCodeLinkOp)(this.repo, iterationId);
    }
    getIterationChangeControl(iterationId) {
        return (0, workspaceServiceChangeControlOps_1.getIterationChangeControlOp)(this.repo, iterationId);
    }
    confirmIterationAnalysis(iterationId, input) {
        return (0, workspaceServiceChangeControlOps_1.confirmIterationAnalysisOp)(this.repo, iterationId, input);
    }
    updateIterationBoundary(iterationId, input) {
        return (0, workspaceServiceChangeControlOps_1.updateIterationBoundaryOp)(this.repo, iterationId, input);
    }
    updateClarificationDraft(iterationId, resolvedQuestions) {
        return (0, workspaceServiceChangeControlOps_1.updateClarificationDraftOp)(this.repo, iterationId, resolvedQuestions);
    }
    updateIterationTestMatrixExecution(iterationId, updates) {
        return (0, workspaceServiceChangeControlOps_1.updateIterationTestMatrixExecutionOp)(this.repo, iterationId, updates);
    }
    locateIterationsByCodeRef(projectId, ref) {
        return (0, workspaceServiceIterationFlowOps_1.locateIterationsByCodeRefOp)(this.repo, projectId, ref);
    }
    getIterationContext(iterationId) {
        return (0, workspaceServiceIterationFlowOps_1.getIterationContextOp)(this.repo, iterationId);
    }
    getAssessment(iterationId) {
        return (0, workspaceServiceIterationFlowOps_1.getAssessmentOp)(this.repo, iterationId);
    }
    listAssessmentSnapshots(iterationId) {
        return (0, workspaceServiceIterationFlowOps_1.listAssessmentSnapshotsOp)(this.repo, iterationId);
    }
    getStateMachine(iterationId) {
        return (0, workspaceServiceIterationFlowOps_1.getStateMachineOp)(this.repo, iterationId);
    }
    transitionIteration(iterationId, toStatus, note = "") {
        return (0, workspaceServiceIterationFlowOps_1.transitionIterationOp)(this.repo, iterationId, toStatus, note);
    }
    recomputeAssessment(iterationId) {
        return (0, workspaceServiceIterationFlowOps_1.recomputeAssessmentOp)(this.repo, iterationId);
    }
    restoreSnapshot(iterationId, snapshotId) {
        return (0, workspaceServiceIterationFlowOps_1.restoreSnapshotOp)(this.repo, iterationId, snapshotId);
    }
    analyzeAttachment(iterationId, input) {
        return (0, workspaceServiceAnalysisOps_1.analyzeAttachmentOp)(this.repo, this.agentRunner, (targetIterationId, toStatus, note) => this.transitionIteration(targetIterationId, toStatus, note), iterationId, input);
    }
    submitAttachmentAnalysisJob(iterationId, input) {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return null;
        }
        const now = new Date().toISOString();
        const jobId = `analysis-${iterationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const summary = summarizeInput(input);
        const runtimeJob = {
            jobId,
            iterationId,
            status: "queued",
            createdAt: now,
            startedAt: "",
            finishedAt: "",
            inputSummary: summary,
            progress: {
                totalFiles: summary.totalFiles,
                processedFiles: 0,
                totalBatches: 0,
                completedBatches: 0,
                failedBatches: 0,
                retriedBatches: 0
            },
            warnings: [],
            error: "",
            result: null,
            input
        };
        this.analysisJobs.set(jobId, runtimeJob);
        this.analysisQueue.push(jobId);
        this.triggerAnalysisQueue();
        return this.toPublicAnalysisJob(runtimeJob);
    }
    getAttachmentAnalysisJob(iterationId, jobId) {
        const job = this.analysisJobs.get(jobId);
        if (!job || job.iterationId !== iterationId) {
            return null;
        }
        return this.toPublicAnalysisJob(job);
    }
    toPublicAnalysisJob(job) {
        const { input: _input, ...publicJob } = job;
        return publicJob;
    }
    triggerAnalysisQueue() {
        while (this.runningAnalysisWorkers < this.analysisWorkerConcurrency && this.analysisQueue.length > 0) {
            const nextJobId = this.analysisQueue.shift();
            if (!nextJobId) {
                return;
            }
            const job = this.analysisJobs.get(nextJobId);
            if (!job || job.status !== "queued") {
                continue;
            }
            this.runningAnalysisWorkers += 1;
            void this.runAttachmentAnalysisJob(nextJobId)
                .catch(() => undefined)
                .finally(() => {
                this.runningAnalysisWorkers = Math.max(0, this.runningAnalysisWorkers - 1);
                this.triggerAnalysisQueue();
            });
        }
    }
    async runAttachmentAnalysisJob(jobId) {
        const job = this.analysisJobs.get(jobId);
        if (!job) {
            return;
        }
        job.status = "running";
        job.startedAt = new Date().toISOString();
        const batches = splitAttachmentInputIntoBatches(job.input, this.analysisBatchFileLimit);
        job.progress.totalBatches = batches.length;
        const reports = [];
        const batchFailures = [];
        try {
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
                const batch = batches[batchIndex];
                const batchFileCount = batch.sourceType === "folder" && Array.isArray(batch.files) && batch.files.length > 0 ? batch.files.length : 1;
                let success = false;
                let lastBatchError = "";
                for (let attempt = 0; attempt <= this.analysisBatchRetryLimit; attempt += 1) {
                    try {
                        const report = await (0, workspaceServiceAnalysisOps_1.analyzeAttachmentOp)(this.repo, this.agentRunner, (targetIterationId, toStatus, note) => this.transitionIteration(targetIterationId, toStatus, note), job.iterationId, batch);
                        if (!report) {
                            throw new Error("iteration not found");
                        }
                        reports.push(report);
                        job.progress.completedBatches += 1;
                        job.progress.processedFiles += batchFileCount;
                        if (attempt > 0) {
                            job.progress.retriedBatches += 1;
                        }
                        success = true;
                        break;
                    }
                    catch (error) {
                        lastBatchError = error instanceof Error ? error.message : "unknown_error";
                        if (attempt < this.analysisBatchRetryLimit) {
                            continue;
                        }
                    }
                }
                if (!success) {
                    job.progress.failedBatches += 1;
                    batchFailures.push(`batch ${batchIndex + 1}/${batches.length}: ${lastBatchError || "unknown_error"}`);
                }
            }
            if (reports.length === 0) {
                throw new Error(batchFailures[0] || "analysis failed");
            }
            job.result = mergeAttachmentReports(job.input, reports, batches.length);
            job.finishedAt = new Date().toISOString();
            job.status = "succeeded";
            if (batchFailures.length > 0) {
                job.warnings = [...batchFailures];
            }
        }
        catch (error) {
            job.status = "failed";
            job.finishedAt = new Date().toISOString();
            job.error = error instanceof Error ? error.message : "analysis failed";
            if (batchFailures.length > 0) {
                job.warnings = [...batchFailures];
            }
        }
    }
    coachIterationConversation(iterationId, message) {
        return (0, workspaceServiceCoachOps_1.coachIterationConversationOp)(this.repo, this.agentRunner, iterationId, message);
    }
    executeVisualEditInstruction(iterationId, message, target) {
        return (0, workspaceServiceVisualEditOps_1.executeVisualEditInstructionOp)(this.repo, iterationId, message, target);
    }
    updateIterationInteractionState(iterationId, input) {
        const iteration = this.repo.findIteration(iterationId);
        if (!iteration) {
            return null;
        }
        const now = new Date().toISOString();
        const normalized = {
            ...iteration,
            interactionState: {
                hasPrototypeAssets: Boolean(input.hasPrototypeAssets),
                uploadKind: input.uploadKind || iteration.interactionState?.uploadKind || "other",
                lastUpdatedAt: now,
                lastAttachmentName: (input.lastAttachmentName || "").trim() || iteration.interactionState?.lastAttachmentName || ""
            }
        };
        this.repo.updateIteration(normalized);
        (0, workspaceServiceCommon_2.writeAuditLog)(this.repo, "iteration_interaction_state_updated", `iteration:${iterationId}`, `hasPrototypeAssets=${normalized.interactionState?.hasPrototypeAssets ? "yes" : "no"};uploadKind=${normalized.interactionState?.uploadKind}`);
        return normalized;
    }
}
exports.WorkspaceService = WorkspaceService;
