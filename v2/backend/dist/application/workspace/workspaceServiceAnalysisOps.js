"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeAttachmentOp = analyzeAttachmentOp;
const agentRunner_1 = require("./agentRunner");
const workspaceSupport_1 = require("./workspaceSupport");
const workspaceServiceCommon_1 = require("./workspaceServiceCommon");
function readPositiveInt(value, fallback) {
    const parsed = Number.parseInt((value || "").trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function loadContextGuardrailsFromEnv() {
    const processEnv = globalThis.process?.env ?? {};
    return {
        maxExcerptLength: readPositiveInt(processEnv.LLM_MAX_EXCERPT_LENGTH, 9000),
        maxChunkCount: readPositiveInt(processEnv.LLM_MAX_CHUNK_COUNT, 6),
        maxPromptBudget: readPositiveInt(processEnv.LLM_MAX_PROMPT_BUDGET, 24000),
        unknownSignalThreshold: readPositiveInt(processEnv.LLM_UNKNOWN_SIGNAL_THRESHOLD, 2),
        maxFolderFiles: readPositiveInt(processEnv.LLM_FOLDER_MAX_FILES, 120),
        maxFolderManifestFiles: readPositiveInt(processEnv.LLM_FOLDER_MANIFEST_MAX_FILES, 60),
        maxFolderExcerptFiles: readPositiveInt(processEnv.LLM_FOLDER_EXCERPT_MAX_FILES, 20)
    };
}
const CONTEXT_GUARDRAILS = loadContextGuardrailsFromEnv();
function isNoiseFile(pathOrName) {
    const value = pathOrName.toLowerCase();
    return (value.includes("/node_modules/") ||
        value.includes("/.git/") ||
        value.includes("/dist/") ||
        value.includes("/build/") ||
        value.includes("/coverage/") ||
        value.includes("/.next/") ||
        value.endsWith(".lock") ||
        value.endsWith("package-lock.json") ||
        value.endsWith("pnpm-lock.yaml") ||
        value.endsWith("yarn.lock") ||
        value.endsWith(".min.js") ||
        value.endsWith(".map"));
}
function prioritizeFolderFiles(files) {
    const score = (item) => {
        const p = `${item.path} ${item.fileName}`.toLowerCase();
        let s = Math.min(item.excerpt.length, 1200);
        if (/(readme|prd|需求|design|spec|api|openapi|schema|model|domain|router|service|controller)/.test(p)) {
            s += 800;
        }
        if (/(test|spec|mock|snapshot|fixture)/.test(p)) {
            s -= 200;
        }
        return s;
    };
    return [...files].sort((a, b) => score(b) - score(a));
}
function composeAttachmentExcerpt(input) {
    const rawFiles = Array.isArray(input.files)
        ? input.files
            .map((item) => ({
            path: (item.path || item.fileName || "").trim(),
            fileName: (item.fileName || "").trim(),
            mimeType: (item.mimeType || "application/octet-stream").trim(),
            size: Number.isFinite(item.size) ? item.size : 0,
            excerpt: (item.excerpt || "").trim()
        }))
            .filter((item) => item.fileName.length > 0)
        : [];
    if (rawFiles.length > 0 || input.sourceType === "folder") {
        const consideredFiles = rawFiles.length;
        const ignoredFiles = [];
        const noiseFiltered = rawFiles.filter((item) => {
            const path = item.path || item.fileName;
            if (isNoiseFile(path)) {
                ignoredFiles.push({ path, reason: "noise" });
                return false;
            }
            return true;
        });
        const skippedNoiseFiles = Math.max(consideredFiles - noiseFiltered.length, 0);
        const nonEmptyFiles = noiseFiltered.filter((item) => {
            const keep = item.excerpt.length > 0 || !item.mimeType.startsWith("text/");
            if (!keep) {
                ignoredFiles.push({ path: item.path || item.fileName, reason: "empty-text" });
            }
            return keep;
        });
        const skippedEmptyFiles = Math.max(noiseFiltered.length - nonEmptyFiles.length, 0);
        const prioritized = prioritizeFolderFiles(nonEmptyFiles);
        const limitedFiles = prioritized.slice(0, CONTEXT_GUARDRAILS.maxFolderFiles);
        const sampled = prioritized.length > limitedFiles.length;
        const sampleReason = sampled ? `over-limit(${prioritized.length}>${CONTEXT_GUARDRAILS.maxFolderFiles})` : "";
        const textFiles = limitedFiles.filter((item) => item.excerpt.length > 0).length;
        const binaryFiles = Math.max(limitedFiles.length - textFiles, 0);
        const manifest = limitedFiles
            .slice(0, CONTEXT_GUARDRAILS.maxFolderManifestFiles)
            .map((item, index) => `[${index + 1}] ${item.path || item.fileName} (${item.mimeType}, ${item.size}B)`)
            .join("\n");
        const excerpts = limitedFiles
            .filter((item) => item.excerpt)
            .slice(0, CONTEXT_GUARDRAILS.maxFolderExcerptFiles)
            .map((item, index) => `[file ${index + 1}] ${item.path || item.fileName}\n${item.excerpt.slice(0, 800)}`)
            .join("\n\n---\n\n");
        const folderLabel = (input.folderName || input.fileName || "folder").trim();
        const batchSize = 30;
        const batchContexts = Array.from({ length: Math.ceil(limitedFiles.length / batchSize) }, (_, index) => {
            const batch = limitedFiles.slice(index * batchSize, index * batchSize + batchSize);
            const manifestPart = batch
                .map((item, i) => `[${index * batchSize + i + 1}] ${item.path || item.fileName} (${item.mimeType})`)
                .join("\n");
            const excerptPart = batch
                .filter((item) => item.excerpt)
                .slice(0, 8)
                .map((item, i) => `[${i + 1}] ${item.path || item.fileName}\n${item.excerpt.slice(0, 400)}`)
                .join("\n\n");
            return [`batch=${index + 1}`, `manifest:\n${manifestPart}`, excerptPart ? `excerpt:\n${excerptPart}` : ""].filter(Boolean).join("\n\n");
        }).slice(0, 4);
        const text = [`folder=${folderLabel}`, `manifest:\n${manifest}`, excerpts ? `excerpt:\n${excerpts}` : ""]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 14000);
        return {
            text,
            digest: (input.excerptDigest || "").trim() ||
                `strategy=folder-batch;considered=${consideredFiles};included=${limitedFiles.length};textFiles=${textFiles};binaryFiles=${binaryFiles};noiseSkipped=${skippedNoiseFiles};emptySkipped=${skippedEmptyFiles};sampled=${sampled ? "yes" : "no"}`,
            strategy: "folder-batch",
            fileStats: {
                totalFiles: limitedFiles.length,
                textFiles,
                binaryFiles
            },
            fileSelection: {
                consideredFiles,
                includedFiles: limitedFiles.length,
                skippedNoiseFiles,
                skippedEmptyFiles,
                sampled,
                sampleReason,
                includedPaths: limitedFiles.map((item) => item.path || item.fileName).slice(0, 12),
                ignoredFiles: ignoredFiles.slice(0, 20)
            },
            batchContexts
        };
    }
    const baseExcerpt = (input.excerpt || "").trim();
    const chunks = Array.isArray(input.excerptChunks) ? input.excerptChunks.map((item) => item.trim()).filter(Boolean).slice(0, 8) : [];
    const digest = (input.excerptDigest || "").trim();
    const strategy = input.excerptStrategy || "direct";
    if (chunks.length === 0) {
        return {
            text: baseExcerpt.slice(0, 6000),
            digest: digest || `strategy=${strategy};chunks=0`,
            strategy,
            fileStats: {
                totalFiles: 1,
                textFiles: baseExcerpt.length > 0 ? 1 : 0,
                binaryFiles: baseExcerpt.length > 0 ? 0 : 1
            },
            fileSelection: {
                consideredFiles: 1,
                includedFiles: 1,
                skippedNoiseFiles: 0,
                skippedEmptyFiles: 0,
                sampled: false,
                sampleReason: "",
                includedPaths: [input.fileName || "attachment"],
                ignoredFiles: []
            },
            batchContexts: []
        };
    }
    const stitched = chunks.map((chunk, index) => `[chunk ${index + 1}/${chunks.length}]\n${chunk}`).join("\n\n---\n\n").slice(0, 12000);
    const combined = [baseExcerpt.slice(0, 3000), stitched].filter(Boolean).join("\n\n");
    return {
        text: combined.slice(0, 12000),
        digest: digest || `strategy=${strategy};chunks=${chunks.length}`,
        strategy,
        fileStats: {
            totalFiles: 1,
            textFiles: combined.length > 0 ? 1 : 0,
            binaryFiles: combined.length > 0 ? 0 : 1
        },
        fileSelection: {
            consideredFiles: 1,
            includedFiles: 1,
            skippedNoiseFiles: 0,
            skippedEmptyFiles: 0,
            sampled: false,
            sampleReason: "",
            includedPaths: [input.fileName || "attachment"],
            ignoredFiles: []
        },
        batchContexts: []
    };
}
function evaluateContextGuardrail(excerptPayload, input) {
    const chunkCount = Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0;
    if (excerptPayload.strategy === "binary-no-text") {
        return { degraded: true, reason: "binary-no-text-requires-clarification" };
    }
    if ((input.sourceType === "folder" || excerptPayload.strategy === "folder-batch") &&
        excerptPayload.fileSelection.consideredFiles > CONTEXT_GUARDRAILS.maxFolderFiles * 2) {
        return {
            degraded: true,
            reason: `folder-too-large(${excerptPayload.fileSelection.consideredFiles}>${CONTEXT_GUARDRAILS.maxFolderFiles * 2})`
        };
    }
    if (excerptPayload.text.length > CONTEXT_GUARDRAILS.maxExcerptLength) {
        return { degraded: true, reason: `excerpt-too-long(${excerptPayload.text.length}>${CONTEXT_GUARDRAILS.maxExcerptLength})` };
    }
    if (chunkCount > CONTEXT_GUARDRAILS.maxChunkCount) {
        return { degraded: true, reason: `chunk-count-too-large(${chunkCount}>${CONTEXT_GUARDRAILS.maxChunkCount})` };
    }
    return { degraded: false, reason: "" };
}
function shouldUseSingleAgentFastPath(input, excerptPayload) {
    if (input.sourceType === "folder" || excerptPayload.fileStats.totalFiles > 1) {
        return false;
    }
    if (excerptPayload.text.length > 1800) {
        return false;
    }
    return true;
}
function buildClarificationQuestions(params) {
    const questions = [];
    if (params.guardrail.degraded) {
        questions.push(`当前分析触发上下文降级（${params.guardrail.reason}），请确认本次迭代边界是否仅包含已列出的差异项。`);
    }
    if (params.strategy === "binary-no-text") {
        questions.push("附件无法直接抽取文本。请补充该附件对应的核心需求、受影响页面/接口和验收标准。");
    }
    if (params.unknownSignalCount >= params.unknownSignalThreshold) {
        questions.push(`模型输出存在较多 unknown 信号（${params.unknownSignalCount}）。请确认关键事实：需求范围、数据口径、上线门禁。`);
    }
    if (params.diffLocations.length === 0) {
        questions.push("未识别到明确差异，请确认是否属于文案优化、布局微调或跨模块需求。");
    }
    return Array.from(new Set(questions));
}
function parseJsonObjectFromText(text) {
    const content = (text || "").trim();
    if (!content) {
        return null;
    }
    try {
        return JSON.parse(content);
    }
    catch {
        const start = content.indexOf("{");
        const end = content.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(content.slice(start, end + 1));
            }
            catch {
                return null;
            }
        }
        return null;
    }
}
function pickString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function pickStringList(value, max = 8) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
        .slice(0, max);
}
function extractGeneratedTestMatrix(agentOutputs) {
    for (const output of agentOutputs) {
        if (output.role !== "qa-reviewer" || output.status !== "success") {
            continue;
        }
        const parsed = parseJsonObjectFromText(output.content);
        const matrix = parsed?.testMatrix;
        if (!Array.isArray(matrix)) {
            continue;
        }
        const normalized = matrix
            .map((item, index) => {
            const row = item;
            const type = typeof row.type === "string" ? row.type.trim() : "";
            const caseId = typeof row.caseId === "string" ? row.caseId.trim() : `auto-case-${index + 1}`;
            const focus = typeof row.focus === "string" ? row.focus.trim() : "";
            const expected = typeof row.expected === "string" ? row.expected.trim() : "";
            const evidence = typeof row.evidence === "string" ? row.evidence.trim() : "";
            return {
                type,
                caseId,
                focus,
                expected,
                evidence,
                executionStatus: "pending",
                executionUpdatedAt: "",
                executionBy: "",
                executionNote: ""
            };
        })
            .filter((item) => item.type || item.caseId || item.focus || item.expected || item.evidence)
            .slice(0, 50);
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return [];
}
function extractBoundarySuggestion(agentOutputs) {
    for (const output of agentOutputs) {
        if (output.role !== "boundary-guardian" || output.status !== "success") {
            continue;
        }
        const parsed = parseJsonObjectFromText(output.content);
        const boundaryRaw = (parsed?.boundary ?? {});
        const requirementRefs = pickStringList(boundaryRaw.requirementRefs, 12);
        const componentRefs = pickStringList(boundaryRaw.componentRefs, 12);
        const codePaths = pickStringList(boundaryRaw.codePaths, 12);
        const note = pickString(boundaryRaw.note);
        const hasAny = requirementRefs.length > 0 || componentRefs.length > 0 || codePaths.length > 0 || note.length > 0;
        if (hasAny) {
            return { requirementRefs, componentRefs, codePaths, note };
        }
    }
    return null;
}
function extractReleaseOpsActions(agentOutputs) {
    for (const output of agentOutputs) {
        if (output.role !== "release-ops-advisor" || output.status !== "success") {
            continue;
        }
        const parsed = parseJsonObjectFromText(output.content);
        const hypotheses = Array.isArray(parsed?.hypotheses) ? parsed?.hypotheses : [];
        const triageSteps = Array.isArray(parsed?.triageSteps) ? parsed?.triageSteps : [];
        const rollbackDecision = (parsed?.rollbackDecision ?? {});
        const actions = [];
        for (const item of hypotheses.slice(0, 3)) {
            const priority = pickString(item.priority) || "P1";
            const content = pickString(item.item);
            if (content) {
                actions.push(`运维假设(${priority})：${content}`);
            }
        }
        for (const step of triageSteps.slice(0, 3)) {
            const detail = pickString(step.step);
            if (detail) {
                actions.push(`排障步骤：${detail}`);
            }
        }
        const shouldRollback = Boolean(rollbackDecision.shouldRollback);
        const reason = pickString(rollbackDecision.reason);
        if (shouldRollback || reason) {
            actions.push(`回滚建议：${shouldRollback ? "建议回滚" : "暂不回滚"}${reason ? `（${reason}）` : ""}`);
        }
        if (actions.length > 0) {
            return actions.slice(0, 6);
        }
    }
    return [];
}
function listParsedRoleOutputs(agentOutputs, role) {
    return agentOutputs
        .filter((item) => item.role === role && item.status === "success")
        .map((item) => parseJsonObjectFromText(item.content))
        .filter((item) => Boolean(item));
}
function extractReleaseOpsStructured(agentOutputs) {
    const parsed = listParsedRoleOutputs(agentOutputs, "release-ops-advisor")[0] ?? null;
    const hypotheses = Array.isArray(parsed?.hypotheses) ? parsed?.hypotheses : [];
    const triageSteps = Array.isArray(parsed?.triageSteps) ? parsed?.triageSteps : [];
    const rollbackDecision = (parsed?.rollbackDecision ?? {});
    return {
        hypotheses: hypotheses
            .slice(0, 5)
            .map((item) => ({
            priority: pickString(item.priority) || "P1",
            item: pickString(item.item),
            evidence: pickString(item.evidence)
        }))
            .filter((item) => item.item),
        triageSteps: triageSteps
            .slice(0, 6)
            .map((item) => ({
            step: pickString(item.step),
            expectedSignal: pickString(item.expectedSignal),
            fallback: pickString(item.fallback)
        }))
            .filter((item) => item.step),
        rollbackDecision: {
            shouldRollback: Boolean(rollbackDecision.shouldRollback),
            reason: pickString(rollbackDecision.reason),
            trigger: pickString(rollbackDecision.trigger)
        }
    };
}
function extractReleaseReview(agentOutputs) {
    const qaParsed = listParsedRoleOutputs(agentOutputs, "qa-reviewer")[0] ?? null;
    const deliveryParsed = listParsedRoleOutputs(agentOutputs, "delivery-engineer")[0] ?? null;
    const qaDecision = (qaParsed?.releaseDecision ?? {});
    const qaBlockers = pickStringList(qaDecision.blockers, 8);
    const qaPass = Boolean(qaDecision.pass);
    const releaseReason = pickString(qaDecision.reason);
    const releaseGates = pickStringList(deliveryParsed?.releaseGates, 8);
    const rollbackPlan = Array.isArray(deliveryParsed?.rollbackPlan)
        ? (deliveryParsed?.rollbackPlan)
            .slice(0, 5)
            .map((item) => {
            const trigger = pickString(item.trigger);
            const action = pickString(item.action);
            return [trigger, action].filter(Boolean).join(" -> ");
        })
            .filter(Boolean)
        : [];
    return {
        qaPass,
        releaseReason,
        blockers: qaBlockers,
        releaseGates,
        rollbackPlan
    };
}
function buildTraceabilityMap(params) {
    const requirements = params.requirements.slice(0, 8);
    const components = params.components.slice(0, 8);
    const codePaths = params.codePaths.slice(0, 12);
    const requirementToComponent = requirements.length > 0
        ? requirements.map((requirement) => ({
            requirement,
            components: components.slice(0, 4),
            evidence: "来源：需求范围与边界组件集合"
        }))
        : [];
    const componentToCode = components.length > 0
        ? components.map((component) => ({
            component,
            codePaths: codePaths.slice(0, 4),
            evidence: "来源：边界 codePaths 与交付计划路径"
        }))
        : [];
    const requirementToCode = requirements.length > 0
        ? requirements.map((requirement) => ({
            requirement,
            codePaths: codePaths.slice(0, 4),
            evidence: "来源：需求边界与代码路径白名单"
        }))
        : [];
    const mappingSlots = requirements.length * 3;
    const mappedSlots = requirementToComponent.length + requirementToCode.length + componentToCode.length;
    const coverageScore = mappingSlots === 0 ? 0 : Math.min(100, Math.round((mappedSlots / mappingSlots) * 100));
    const gaps = [];
    if (requirements.length === 0) {
        gaps.push("缺少 requirementRefs，无法形成需求侧映射。");
    }
    if (components.length === 0) {
        gaps.push("缺少 componentRefs，无法形成组件侧映射。");
    }
    if (codePaths.length === 0) {
        gaps.push("缺少 codePaths，无法形成代码路径映射。");
    }
    if (params.prioritizedFindings.some((item) => item.priority === "P0") && codePaths.length === 0) {
        gaps.push("存在 P0 发现但缺少路径白名单，发布风险不可控。");
    }
    return {
        requirementToComponent,
        componentToCode,
        requirementToCode,
        coverageScore,
        gaps: Array.from(new Set(gaps)).slice(0, 8)
    };
}
function buildDomainKnowledge(params) {
    const requirementTerms = params.requirements
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);
    const parsedRequirements = listParsedRoleOutputs(params.agentOutputs, "requirements-analyst")[0] ?? null;
    const parsedUnknowns = pickStringList(parsedRequirements?.unknowns, 8);
    const parsedRules = pickStringList((parsedRequirements?.assumptions ?? []), 8);
    const termCandidates = requirementTerms.length > 0
        ? requirementTerms
        : params.excerpt
            .split(/[，。；、\n:：]/)
            .map((item) => item.trim())
            .filter((item) => item.length >= 2 && item.length <= 28)
            .slice(0, 8);
    const terms = termCandidates.map((term) => ({
        term,
        definition: `与${params.projectCategory || "业务"}相关的需求术语，需在实现与验收中保持一致语义。`,
        mappedTo: {
            pages: [],
            apis: [],
            entities: [],
            codePaths: params.codePaths.slice(0, 3)
        },
        evidence: "来源：需求条目 / 附件摘要"
    }));
    return {
        terms,
        rules: parsedRules.length > 0 ? parsedRules : ["高风险需求必须有可验证验收项与回归点。"],
        unknowns: parsedUnknowns
    };
}
async function executeAgentPlanOp(agentRunner, prompts) {
    if (!agentRunner) {
        throw new agentRunner_1.LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
    }
    const processEnv = globalThis.process?.env ?? {};
    const configuredParallelism = Number.parseInt((processEnv.LLM_PLAN_PARALLELISM || "").trim(), 10);
    const parallelism = Number.isInteger(configuredParallelism) && configuredParallelism > 0 ? Math.min(configuredParallelism, 6) : 2;
    const outputs = [];
    for (let i = 0; i < prompts.length; i += parallelism) {
        const group = prompts.slice(i, i + parallelism);
        const groupOutputs = await Promise.all(group.map(async (prompt) => {
            let result;
            try {
                result = await agentRunner.run(prompt);
            }
            catch (error) {
                throw new agentRunner_1.LlmInvocationError(`LLM invocation failed for ${prompt.role}: ${error instanceof Error ? error.message : "unknown_error"}`);
            }
            return {
                agentId: prompt.agentId,
                role: prompt.role,
                status: "success",
                content: result.content,
                model: result.model
            };
        }));
        outputs.push(...groupOutputs);
    }
    return outputs;
}
async function synthesizeProjectProfileOp(agentRunner, params) {
    if (!agentRunner) {
        throw new agentRunner_1.LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
    }
    const compactOutputLength = params.sourceType === "single-file" ? 320 : 520;
    const compactOutputs = params.agentOutputs
        .slice(0, 6)
        .map((item) => `${item.role}:${item.status}\n${(item.content || "").slice(0, compactOutputLength)}`)
        .join("\n\n---\n\n");
    const prompt = {
        agentId: "agent-report-synthesis-1",
        role: "orchestrator",
        scope: "attachment",
        goal: "识别项目/产品并输出高价值发现",
        expectedOutput: "JSON: {projectDetection:{projectName,productName,projectCategory,evidence[]}, meaningfulFindings:[...], prioritizedFindings:[{priority,content,reason}], nextActions:[...]}",
        systemPrompt: "你是资深产品分析师。你必须只输出 JSON，不得输出解释文字。输出必须具体、可证据化，禁止空泛话术。",
        userPrompt: [
            `分析目标=${params.analyzedTarget};sourceType=${params.sourceType};iteration=${params.iterationName};context=${params.contextLabel || "primary"}`,
            `文件统计=total:${params.fileStats.totalFiles},text:${params.fileStats.textFiles},binary:${params.fileStats.binaryFiles}`,
            `版本差异=added:${params.versionDiff.added.join(" | ") || "-"};changed:${params.versionDiff.changed.join(" | ") || "-"};removed:${params.versionDiff.removed.join(" | ") || "-"}`,
            `附件节选:\n${params.excerpt.slice(0, 2500) || "无"}`,
            `多Agent输出:\n${compactOutputs || "无"}`,
            "请输出：1)项目名称 2)产品名称 3)项目类别 4)依据(evidence<=4条) 5)关键发现(meaningfulFindings<=8条) 6)优先级发现(prioritizedFindings<=8条，priority=P0/P1/P2) 7)下一步动作(nextActions<=6条)。"
        ].join("\n\n")
    };
    try {
        const parseCandidate = (content) => {
            const parsed = parseJsonObjectFromText(content);
            const rawProject = (parsed?.projectDetection ?? {});
            const projectName = pickString(rawProject.projectName);
            const productName = pickString(rawProject.productName);
            const projectCategory = pickString(rawProject.projectCategory);
            const evidence = pickStringList(rawProject.evidence, 4);
            const meaningfulFindings = pickStringList(parsed?.meaningfulFindings, 8);
            const prioritizedFindings = Array.isArray(parsed?.prioritizedFindings)
                ? parsed.prioritizedFindings
                    .map((item) => item)
                    .map((item) => ({
                    priority: pickString(item.priority),
                    content: pickString(item.content),
                    reason: pickString(item.reason)
                }))
                    .filter((item) => (item.priority === "P0" || item.priority === "P1" || item.priority === "P2") && item.content)
                    .slice(0, 8)
                : [];
            const nextActions = pickStringList(parsed?.nextActions, 6);
            return { projectName, productName, projectCategory, evidence, meaningfulFindings, prioritizedFindings, nextActions };
        };
        const missingReasonsOf = (candidate) => {
            const reasons = [];
            if (!candidate.projectName && !candidate.productName)
                reasons.push("missing projectDetection.projectName/productName");
            if (candidate.meaningfulFindings.length === 0)
                reasons.push("meaningfulFindings is empty");
            if (candidate.prioritizedFindings.length === 0)
                reasons.push("prioritizedFindings is empty");
            if (candidate.nextActions.length === 0)
                reasons.push("nextActions is empty");
            return reasons;
        };
        let selectedResult = await agentRunner.run(prompt);
        let candidate = parseCandidate(selectedResult.content);
        let missingReasons = missingReasonsOf(candidate);
        const maxRepairAttempts = params.sourceType === "single-file" && params.fileStats.totalFiles <= 1 ? 1 : 2;
        for (let attempt = 1; attempt <= maxRepairAttempts && missingReasons.length > 0; attempt += 1) {
            const repairPrompt = {
                ...prompt,
                agentId: `agent-report-synthesis-repair-${attempt}`,
                userPrompt: [
                    prompt.userPrompt,
                    "你上一版输出不满足必填字段约束。请只输出严格 JSON，且必须满足：",
                    "1) projectDetection.projectName 或 projectDetection.productName 至少一个非空",
                    "2) meaningfulFindings 至少 1 条",
                    "3) prioritizedFindings 至少 1 条且 priority 仅允许 P0/P1/P2",
                    "4) nextActions 至少 1 条",
                    `本次缺失项：${missingReasons.join("; ")}`,
                    `上一版输出：\n${selectedResult.content.slice(0, 2400)}`
                ].join("\n\n")
            };
            selectedResult = await agentRunner.run(repairPrompt);
            candidate = parseCandidate(selectedResult.content);
            missingReasons = missingReasonsOf(candidate);
        }
        if (candidate.prioritizedFindings.length === 0 && candidate.meaningfulFindings.length > 0) {
            const prioritizePrompt = {
                agentId: "agent-report-prioritize-1",
                role: "orchestrator",
                scope: "attachment",
                goal: "基于关键发现输出优先级发现",
                expectedOutput: "JSON: {prioritizedFindings:[{priority,content,reason}]}",
                systemPrompt: "你是资深技术负责人。你必须只输出 JSON，不得输出解释文字。priority 只能是 P0/P1/P2。",
                userPrompt: [
                    `分析目标=${params.analyzedTarget};iteration=${params.iterationName}`,
                    `关键发现:\n${candidate.meaningfulFindings.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
                    "请输出 prioritizedFindings（1-8条），每条包含 priority/content/reason。"
                ].join("\n\n")
            };
            const prioritizedResult = await agentRunner.run(prioritizePrompt);
            const prioritizedParsed = parseJsonObjectFromText(prioritizedResult.content);
            const prioritizedFromModel = Array.isArray(prioritizedParsed?.prioritizedFindings)
                ? prioritizedParsed.prioritizedFindings
                    .map((item) => item)
                    .map((item) => ({
                    priority: pickString(item.priority),
                    content: pickString(item.content),
                    reason: pickString(item.reason)
                }))
                    .filter((item) => (item.priority === "P0" || item.priority === "P1" || item.priority === "P2") && item.content)
                    .slice(0, 8)
                : [];
            if (prioritizedFromModel.length > 0) {
                candidate = { ...candidate, prioritizedFindings: prioritizedFromModel };
            }
        }
        if (!candidate.projectName && !candidate.productName) {
            throw new agentRunner_1.LlmInvocationError("LLM synthesis returned invalid payload: missing projectDetection.projectName/productName");
        }
        if (candidate.meaningfulFindings.length === 0) {
            throw new agentRunner_1.LlmInvocationError("LLM synthesis returned invalid payload: meaningfulFindings is empty");
        }
        if (candidate.prioritizedFindings.length === 0) {
            throw new agentRunner_1.LlmInvocationError("LLM synthesis returned invalid payload: prioritizedFindings is empty");
        }
        if (candidate.nextActions.length === 0) {
            throw new agentRunner_1.LlmInvocationError("LLM synthesis returned invalid payload: nextActions is empty");
        }
        const confidence = candidate.evidence.length >= 3 ? "high" : candidate.evidence.length >= 1 ? "medium" : "low";
        return {
            projectDetection: {
                projectName: candidate.projectName,
                productName: candidate.productName,
                projectCategory: candidate.projectCategory,
                evidence: candidate.evidence,
                confidence
            },
            meaningfulFindings: candidate.meaningfulFindings,
            prioritizedFindings: candidate.prioritizedFindings,
            nextActions: candidate.nextActions,
            synthesisOutput: {
                agentId: prompt.agentId,
                role: prompt.role,
                status: "success",
                content: selectedResult.content,
                model: selectedResult.model
            }
        };
    }
    catch (error) {
        throw new agentRunner_1.LlmInvocationError(error instanceof Error ? error.message : "llm_unknown_error");
    }
}
function mergeSynthesisResults(base, syntheses) {
    const projectDetection = { ...base.projectDetection };
    const findings = [...base.meaningfulFindings];
    const prioritized = [...base.prioritizedFindings];
    const nextActions = [...base.nextActions];
    for (const item of syntheses) {
        if (item.projectDetection) {
            if (item.projectDetection.projectName) {
                projectDetection.projectName = item.projectDetection.projectName;
            }
            if (item.projectDetection.productName) {
                projectDetection.productName = item.projectDetection.productName;
            }
            if (item.projectDetection.projectCategory) {
                projectDetection.projectCategory = item.projectDetection.projectCategory;
            }
            projectDetection.evidence = Array.from(new Set([...projectDetection.evidence, ...item.projectDetection.evidence])).slice(0, 5);
            if (item.projectDetection.confidence === "high") {
                projectDetection.confidence = "high";
            }
            else if (projectDetection.confidence === "low" && item.projectDetection.confidence === "medium") {
                projectDetection.confidence = "medium";
            }
        }
        if (item.meaningfulFindings?.length) {
            findings.push(...item.meaningfulFindings);
        }
        if (item.prioritizedFindings?.length) {
            prioritized.push(...item.prioritizedFindings);
        }
        if (item.nextActions?.length) {
            nextActions.push(...item.nextActions);
        }
    }
    return {
        projectDetection,
        meaningfulFindings: Array.from(new Set(findings)).slice(0, 10),
        prioritizedFindings: Array.from(new Map(prioritized.map((item) => [`${item.priority}:${item.content}`, item])).values()).slice(0, 10),
        nextActions: Array.from(new Set(nextActions)).slice(0, 8)
    };
}
function applyLifecycleTransitionOp(transitionIteration, iterationId, fromStatus, toStatus, autoTransition) {
    if (!toStatus || toStatus === fromStatus) {
        return { attempted: false, applied: false, fromStatus, toStatus, note: "推荐状态与当前一致，未触发自动流转。" };
    }
    if (!autoTransition) {
        return { attempted: false, applied: false, fromStatus, toStatus, note: `已生成状态流转建议 ${fromStatus} -> ${toStatus}，等待手动确认。` };
    }
    const result = transitionIteration(iterationId, toStatus, "Agent 自动驱动流转");
    if (result.ok) {
        return { attempted: true, applied: true, fromStatus, toStatus, note: `已自动流转：${fromStatus} -> ${toStatus}` };
    }
    return { attempted: true, applied: false, fromStatus, toStatus, note: `自动流转失败：${result.reason || "unknown"}` };
}
async function analyzeAttachmentOp(repo, agentRunner, transitionIteration, iterationId, input) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return null;
    }
    const normalized = (0, workspaceSupport_1.normalizeIteration)(iteration);
    const previous = repo.findPreviousIteration(normalized);
    const previousScope = previous?.scope.inScope ?? [];
    const currentScope = normalized.scope.inScope;
    const excerptPayload = composeAttachmentExcerpt(input);
    const initialContextGuardrail = evaluateContextGuardrail(excerptPayload, input);
    const added = currentScope.filter((item) => !previousScope.includes(item));
    const removed = previousScope.filter((item) => !currentScope.includes(item));
    const diffLocations = (0, workspaceSupport_1.buildDiffLocations)(previous ? (0, workspaceSupport_1.normalizeIteration)(previous) : null, normalized);
    const singleAgentFastPath = shouldUseSingleAgentFastPath(input, excerptPayload);
    const changed = diffLocations.filter((item) => item.changeType === "changed").map((item) => `${item.dimension}: ${item.currentItem}`);
    const inferredRisks = (0, workspaceSupport_1.inferRisksFromExcerpt)(excerptPayload.text);
    const normalizedRisks = normalized.assessment.risks.length > 0
        ? normalized.assessment.risks
        : inferredRisks.length > 0
            ? inferredRisks
            : ["暂无显式风险，请结合业务验收继续确认。"];
    const agentPlan = (0, workspaceSupport_1.buildIterationAgentPlan)({
        iteration: normalized,
        previous: previous ? (0, workspaceSupport_1.normalizeIteration)(previous) : null,
        scope: input.agentScope ?? "full-cycle",
        diffLocations,
        risks: normalizedRisks,
        fileName: input.fileName,
        attachmentMeta: { strategy: excerptPayload.strategy, digest: excerptPayload.digest, textPreview: excerptPayload.text },
        enforceSingleAgent: initialContextGuardrail.degraded || singleAgentFastPath,
        forceMultiAgent: singleAgentFastPath ? false : input.forceMultiAgent
    });
    const primaryPromptContextLength = agentPlan.prompts.reduce((total, prompt) => total + prompt.systemPrompt.length + prompt.userPrompt.length, 0);
    const degradeByPromptBudget = primaryPromptContextLength > CONTEXT_GUARDRAILS.maxPromptBudget && agentPlan.strategy === "multi-agent";
    const finalContextGuardrail = initialContextGuardrail.degraded
        ? initialContextGuardrail
        : degradeByPromptBudget
            ? { degraded: true, reason: `prompt-budget-exceeded(${primaryPromptContextLength}>${CONTEXT_GUARDRAILS.maxPromptBudget})` }
            : { degraded: false, reason: "" };
    const finalAgentPlan = degradeByPromptBudget
        ? (0, workspaceSupport_1.buildIterationAgentPlan)({
            iteration: normalized,
            previous: previous ? (0, workspaceSupport_1.normalizeIteration)(previous) : null,
            scope: input.agentScope ?? "full-cycle",
            diffLocations,
            risks: normalizedRisks,
            fileName: input.fileName,
            attachmentMeta: { strategy: excerptPayload.strategy, digest: excerptPayload.digest, textPreview: excerptPayload.text },
            enforceSingleAgent: true,
            forceMultiAgent: false
        })
        : agentPlan;
    const agentOutputs = await executeAgentPlanOp(agentRunner, finalAgentPlan.prompts);
    const unknownSignalCount = agentOutputs.reduce((total, output) => total + (output.content.toLowerCase().match(/unknown/g)?.length ?? 0), 0);
    const generatedTestMatrix = extractGeneratedTestMatrix(agentOutputs);
    const boundarySuggestion = extractBoundarySuggestion(agentOutputs);
    const releaseOpsActions = extractReleaseOpsActions(agentOutputs);
    const clarificationQuestions = buildClarificationQuestions({
        guardrail: finalContextGuardrail,
        unknownSignalCount,
        unknownSignalThreshold: CONTEXT_GUARDRAILS.unknownSignalThreshold,
        strategy: excerptPayload.strategy,
        diffLocations
    });
    const llmPromptContextLength = finalAgentPlan.prompts.reduce((total, prompt) => total + prompt.systemPrompt.length + prompt.userPrompt.length, 0);
    const finalLifecycleAction = applyLifecycleTransitionOp(transitionIteration, iterationId, normalized.status, finalAgentPlan.recommendedTransition, input.autoTransition === true);
    const currentChangeControl = normalized.changeControl ?? (0, workspaceServiceCommon_1.defaultIterationChangeControl)();
    const currentBoundary = currentChangeControl.boundary ?? (0, workspaceServiceCommon_1.defaultIterationChangeControl)().boundary;
    const boundaryIsEmpty = currentBoundary.requirementRefs.length === 0 &&
        currentBoundary.componentRefs.length === 0 &&
        currentBoundary.codePaths.length === 0 &&
        !currentBoundary.note;
    const resolvedBoundary = boundarySuggestion && boundaryIsEmpty
        ? {
            requirementRefs: boundarySuggestion.requirementRefs,
            componentRefs: boundarySuggestion.componentRefs,
            codePaths: boundarySuggestion.codePaths,
            note: boundarySuggestion.note || "由 boundary-guardian 自动建议，待人工确认。",
            updatedAt: new Date().toISOString()
        }
        : currentBoundary;
    normalized.changeControl = {
        ...currentChangeControl,
        pendingHumanConfirmation: true,
        lastAnalysisAt: new Date().toISOString(),
        lastAnalysisFileName: input.fileName,
        lastAnalysisDigest: `added=${added.length};removed=${removed.length};diff=${diffLocations.length};strategy=${excerptPayload.strategy};chunks=${Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0};degraded=${finalContextGuardrail.degraded ? "yes" : "no"};fastPath=${singleAgentFastPath ? "yes" : "no"}${finalContextGuardrail.reason ? `;reason=${finalContextGuardrail.reason}` : ""}`,
        clarificationQuestions,
        clarificationDraftResolvedQuestions: [],
        clarificationDraftUpdatedAt: new Date().toISOString(),
        lastClarificationResolution: { resolvedQuestions: [], unresolvedQuestions: clarificationQuestions, updatedAt: new Date().toISOString() },
        lastClarificationNote: "",
        confirmedAt: "",
        confirmedBy: "",
        boundary: resolvedBoundary,
        generatedTestMatrix,
        generatedTestMatrixUpdatedAt: generatedTestMatrix.length > 0 ? new Date().toISOString() : "",
        testMatrixExecutionUpdatedAt: ""
    };
    repo.updateIteration(normalized);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "attachment_analyzed", `iteration:${iterationId}`, `分析附件 ${input.fileName}`);
    if (generatedTestMatrix.length > 0) {
        (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_test_matrix_generated", `iteration:${iterationId}`, `cases=${generatedTestMatrix.length}`);
    }
    const attachmentInsights = (0, workspaceSupport_1.buildAttachmentInsights)({
        fileName: input.fileName,
        mimeType: input.mimeType,
        excerpt: excerptPayload.text,
        strategy: excerptPayload.strategy,
        iterationName: normalized.name,
        diffLocations,
        added,
        changed,
        removed
    });
    const projectDetection = (0, workspaceSupport_1.detectProjectAndProduct)({
        excerpt: excerptPayload.text,
        iterationName: normalized.name,
        fileName: input.fileName,
        fileCount: excerptPayload.fileStats.totalFiles,
        projectCategoryHint: attachmentInsights.projectCategory
    });
    const meaningfulFindings = (0, workspaceSupport_1.buildMeaningfulFindings)({
        added,
        changed,
        removed,
        characteristics: attachmentInsights.keyCharacteristics,
        risks: normalizedRisks,
        diffLocations
    });
    const synthesis = await synthesizeProjectProfileOp(agentRunner, {
        iterationName: normalized.name,
        sourceType: input.sourceType === "folder" ? "folder" : "single-file",
        analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
        excerpt: excerptPayload.text,
        fileStats: excerptPayload.fileStats,
        versionDiff: { added, changed, removed },
        agentOutputs,
        contextLabel: "primary"
    });
    const batchSyntheses = excerptPayload.batchContexts.length
        ? await Promise.all(excerptPayload.batchContexts.map((batchContext, index) => synthesizeProjectProfileOp(agentRunner, {
            iterationName: normalized.name,
            sourceType: input.sourceType === "folder" ? "folder" : "single-file",
            analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
            excerpt: batchContext,
            fileStats: excerptPayload.fileStats,
            versionDiff: { added, changed, removed },
            agentOutputs,
            contextLabel: `batch-${index + 1}`
        })))
        : [];
    const resolvedProjectDetection = {
        projectName: synthesis.projectDetection.projectName || projectDetection.projectName,
        productName: synthesis.projectDetection.productName || projectDetection.productName,
        projectCategory: synthesis.projectDetection.projectCategory || projectDetection.projectCategory,
        evidence: synthesis.projectDetection.evidence.length > 0 ? synthesis.projectDetection.evidence : projectDetection.evidence,
        confidence: synthesis.projectDetection.confidence || projectDetection.confidence
    };
    const mergedSynthesis = mergeSynthesisResults({
        projectDetection: {
            ...resolvedProjectDetection,
            confidence: resolvedProjectDetection.confidence || "low"
        },
        meaningfulFindings: synthesis.meaningfulFindings,
        prioritizedFindings: synthesis.prioritizedFindings,
        nextActions: synthesis.nextActions
    }, batchSyntheses);
    const resolvedProjectDetectionWithPaths = {
        ...mergedSynthesis.projectDetection,
        evidence: Array.from(new Set([
            ...mergedSynthesis.projectDetection.evidence,
            ...(excerptPayload.fileSelection.includedPaths.length > 0
                ? [`命中文件: ${excerptPayload.fileSelection.includedPaths.slice(0, 3).join("；")}`]
                : [])
        ])).slice(0, 5)
    };
    const resolvedMeaningfulFindings = mergedSynthesis.meaningfulFindings;
    const resolvedPrioritizedFindings = mergedSynthesis.prioritizedFindings.length > 0 ? mergedSynthesis.prioritizedFindings : (0, workspaceSupport_1.prioritizeFindings)(resolvedMeaningfulFindings);
    const resolvedNextActions = mergedSynthesis.nextActions.length > 0
        ? mergedSynthesis.nextActions
        : (0, workspaceSupport_1.buildNextActions)({
            prioritizedFindings: resolvedPrioritizedFindings,
            boundaryCodePaths: normalized.changeControl?.boundary?.codePaths || [],
            clarificationQuestions
        });
    const finalNextActions = Array.from(new Set([...resolvedNextActions, ...releaseOpsActions].map((item) => item.trim()).filter(Boolean))).slice(0, 12);
    const resolvedBoundaryForReport = normalized.changeControl?.boundary ?? currentChangeControl.boundary;
    const releaseOpsStructured = extractReleaseOpsStructured(agentOutputs);
    const qaReleaseReview = extractReleaseReview(agentOutputs);
    const traceabilityMap = buildTraceabilityMap({
        requirements: resolvedBoundaryForReport?.requirementRefs?.length > 0
            ? resolvedBoundaryForReport.requirementRefs
            : normalized.scope.inScope.slice(0, 8),
        components: resolvedBoundaryForReport?.componentRefs ?? [],
        codePaths: resolvedBoundaryForReport?.codePaths ?? [],
        prioritizedFindings: resolvedPrioritizedFindings
    });
    const domainKnowledge = buildDomainKnowledge({
        requirements: resolvedBoundaryForReport?.requirementRefs?.length > 0
            ? resolvedBoundaryForReport.requirementRefs
            : normalized.scope.inScope.slice(0, 8),
        codePaths: resolvedBoundaryForReport?.codePaths ?? [],
        excerpt: excerptPayload.text,
        agentOutputs,
        projectCategory: attachmentInsights.projectCategory
    });
    const boundaryCoverage = (resolvedBoundaryForReport?.requirementRefs?.length || 0) > 0 &&
        (resolvedBoundaryForReport?.componentRefs?.length || 0) > 0 &&
        (resolvedBoundaryForReport?.codePaths?.length || 0) > 0
        ? 100
        : (resolvedBoundaryForReport?.requirementRefs?.length || 0) > 0 ||
            (resolvedBoundaryForReport?.componentRefs?.length || 0) > 0 ||
            (resolvedBoundaryForReport?.codePaths?.length || 0) > 0
            ? 60
            : 0;
    const releaseDecision = qaReleaseReview.blockers.length > 0
        ? "block"
        : qaReleaseReview.qaPass
            ? "go"
            : "caution";
    const opsRollbackReason = releaseOpsStructured.rollbackDecision.reason;
    const opsRollbackTrigger = releaseOpsStructured.rollbackDecision.trigger;
    const releaseReview = {
        decision: releaseDecision,
        reason: qaReleaseReview.releaseReason || (releaseDecision === "go" ? "未发现阻断项，可按门禁发布。" : "存在待确认风险。"),
        blockers: qaReleaseReview.blockers,
        releaseGates: qaReleaseReview.releaseGates,
        recommendations: finalNextActions.slice(0, 6),
        rollback: {
            shouldRollback: releaseOpsStructured.rollbackDecision.shouldRollback,
            reason: opsRollbackReason || (releaseOpsStructured.rollbackDecision.shouldRollback ? "触发回滚条件。" : ""),
            trigger: opsRollbackTrigger,
            actions: qaReleaseReview.rollbackPlan
        },
        qualitySignals: {
            testCaseCount: generatedTestMatrix.length,
            p0FindingCount: resolvedPrioritizedFindings.filter((item) => item.priority === "P0").length,
            unknownSignalCount,
            boundaryCoverage
        }
    };
    const opsTriage = {
        hypotheses: releaseOpsStructured.hypotheses,
        triageSteps: releaseOpsStructured.triageSteps,
        rollbackSuggestion: `回滚建议：${releaseReview.rollback.shouldRollback ? "建议回滚" : "暂不回滚"}${releaseReview.rollback.reason ? `（${releaseReview.rollback.reason}）` : ""}`
    };
    const analysisP0Count = resolvedPrioritizedFindings.filter((item) => item.priority === "P0").length;
    const analysisHighValueCount = resolvedPrioritizedFindings.filter((item) => item.priority === "P0" || item.priority === "P1").length;
    const analysisConsideredFiles = excerptPayload.fileSelection.consideredFiles;
    const analysisIgnoredFiles = excerptPayload.fileSelection.ignoredFiles.length;
    const analysisIgnoredRatio = analysisConsideredFiles === 0 ? 0 : Math.round((analysisIgnoredFiles / analysisConsideredFiles) * 100);
    normalized.changeControl = {
        ...(normalized.changeControl ?? currentChangeControl),
        lastAnalysisP0Count: analysisP0Count,
        lastAnalysisHighValueCount: analysisHighValueCount,
        lastAnalysisConsideredFiles: analysisConsideredFiles,
        lastAnalysisIgnoredFiles: analysisIgnoredFiles,
        lastAnalysisIgnoredFileRatio: analysisIgnoredRatio,
        lastReleaseReviewDecision: releaseReview.decision,
        lastReleaseReviewReason: releaseReview.reason,
        lastReleaseReviewBlockers: releaseReview.blockers,
        lastReleaseReviewUpdatedAt: new Date().toISOString(),
        lastTraceabilityCoverageScore: traceabilityMap.coverageScore,
        lastOpsRollbackSuggested: releaseReview.rollback.shouldRollback
    };
    repo.updateIteration(normalized);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "attachment_project_detection_synthesized", `iteration:${iterationId}`, `target=${input.fileName}`);
    const synthesisOutputs = [
        synthesis.synthesisOutput,
        ...batchSyntheses.map((item) => item.synthesisOutput)
    ].filter(Boolean);
    const outputList = synthesisOutputs.length > 0 ? [...agentOutputs, ...synthesisOutputs] : agentOutputs;
    return {
        iterationId: normalized.id,
        iterationName: normalized.name,
        fileName: input.fileName,
        sourceType: input.sourceType === "folder" ? "folder" : "single-file",
        analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
        fileStats: excerptPayload.fileStats,
        fileSelection: excerptPayload.fileSelection,
        projectDetection: resolvedProjectDetectionWithPaths,
        meaningfulFindings: resolvedMeaningfulFindings,
        prioritizedFindings: resolvedPrioritizedFindings,
        nextActions: finalNextActions,
        analyzedAt: new Date().toISOString(),
        attachmentInsights,
        llmContext: {
            strategy: excerptPayload.strategy,
            digest: excerptPayload.digest,
            excerptLength: excerptPayload.text.length,
            chunkCount: Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0,
            promptContextLength: llmPromptContextLength,
            agentCount: finalAgentPlan.prompts.length,
            unknownSignalCount,
            degraded: finalContextGuardrail.degraded,
            degradeReason: finalContextGuardrail.reason
        },
        clarificationQuestions,
        understanding: `${(0, workspaceSupport_1.summarizeFromExcerpt)(excerptPayload.text, `已基于附件 ${input.fileName} 与当前迭代上下文完成语义理解。`)} 识别到 ${added.length} 项新增范围、${removed.length} 项移出范围。(${excerptPayload.digest})`,
        versionDiff: { baselineIterationName: previous?.name ?? "无基线", added, changed, removed },
        diffLocations,
        cyclePhase: (0, workspaceSupport_1.inferCyclePhase)(normalized.status),
        agentPlan: finalAgentPlan,
        agentOutputs: outputList,
        lifecycleAction: finalLifecycleAction,
        risks: normalizedRisks,
        traceabilityMap,
        releaseReview,
        domainKnowledge,
        opsTriage,
        suggestions: [
            "优先处理新增范围中的高业务价值项并明确负责人。",
            "将关键差异同步到验收标准，避免需求理解偏差。",
            attachmentInsights.versionChangeSummary,
            ...releaseOpsActions.slice(0, 2),
            ...attachmentInsights.limitations,
            clarificationQuestions.length > 0 ? `请优先补充：${clarificationQuestions.join("；")}` : "当前澄清问题已收敛。"
        ]
    };
}
