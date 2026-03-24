import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { LlmInvocationError, LlmUnavailableError, type AgentRunOptions, type AgentRunner } from "./agentRunner";
import type {
  AttachmentAnalysisReport,
  AttachmentUploadInput,
  IterationAgentOutput,
  IterationAgentPrompt,
  IterationStatus,
  IterationTransitionSource,
  VisionPayload
} from "../../domain/workspace/types";
import {
  buildDiffLocations,
  buildIterationAgentPlan,
  inferCyclePhase,
  normalizeIteration
} from "./workspaceSupport";
import {
  collectLlmBackedReportPayloadIssues,
  extractBoundarySuggestion,
  extractGeneratedQualityArtifacts,
  extractGeneratedTestMatrix,
  extractReleaseOpsActions,
  extractReleaseOpsStructured,
  extractReleaseReview,
  extractUxArtifacts,
  isLowSignalText
} from "./workspaceAnalysisExtractors";
import { listAttachmentInsightsMissingReasons, parseAttachmentInsightsCandidate } from "./workspaceServiceAnalysisAttachmentInsightsOps";
import { executeAgentPlanPromptsOp, resolvePlanParallelismFromEnv } from "./workspaceServiceAnalysisAgentPlanOps";
import { listDeepInsightsMissingReasons, parseDeepInsightsCandidate } from "./workspaceServiceAnalysisDeepInsightsOps";
import { buildDeepInsightsFileManifest } from "./workspaceServiceAnalysisDeepInsightsPromptOps";
import {
  listExecutionPolicyMissingReasons,
  listFolderSelectionMissingReasons,
  parseExecutionPolicyCandidate,
  parseFolderSelectionCandidate
} from "./workspaceServiceAnalysisPreflightOps";
import { buildClarificationQuestionsOp, mergeSynthesisResultsOp } from "./workspaceServiceAnalysisSynthesisOps";
import { readPositiveInt, readStringList } from "./workspaceEnvParsers";
import { defaultIterationChangeControl, writeAuditLog } from "./workspaceServiceCommon";
import { composeAttachmentExcerpt, resolveVisionPayloads, type FolderSelectionDecision } from "./workspaceServiceAnalysisInputOps";
import {
  synthesizeBusinessConfirmationOp,
  synthesizeGovernanceInsightsOp,
  synthesizeReleaseReviewOp,
  synthesizeReportQualityGateOp
} from "./workspaceServiceAnalysisGovernanceRunnerOps";
import { synthesizeProjectProfileOp } from "./workspaceServiceAnalysisProjectProfileRunnerOps";

type ContextGuardrails = {
  maxExcerptLength: number;
  maxChunkCount: number;
  maxPromptBudget: number;
  unknownSignalThreshold: number;
  maxFolderFiles: number;
  maxFolderManifestFiles: number;
  maxFolderExcerptFiles: number;
};

type SynthesisLlmConfig = {
  fallbackModels: string[];
  repairAttemptsSingleFile: number;
  repairAttemptsBatch: number;
  findingsRepairAttempts: number;
  projectDetectionRepairAttempts: number;
};

function loadContextGuardrailsFromEnv(): ContextGuardrails {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
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

function loadSynthesisLlmConfigFromEnv(): SynthesisLlmConfig {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const explicitFallbackModels = readStringList(processEnv.LLM_SYNTHESIS_FALLBACK_MODELS);
  const sharedFallbackModels = readStringList(processEnv.LLM_FALLBACK_MODELS);
  const fallbackModels = explicitFallbackModels.length > 0 ? explicitFallbackModels : sharedFallbackModels;
  return {
    fallbackModels,
    repairAttemptsSingleFile: readPositiveInt(processEnv.LLM_SYNTHESIS_REPAIR_ATTEMPTS_SINGLE, 2),
    repairAttemptsBatch: readPositiveInt(processEnv.LLM_SYNTHESIS_REPAIR_ATTEMPTS_BATCH, 4),
    findingsRepairAttempts: readPositiveInt(processEnv.LLM_SYNTHESIS_FINDINGS_REPAIR_ATTEMPTS, 3),
    projectDetectionRepairAttempts: readPositiveInt(processEnv.LLM_SYNTHESIS_PROJECT_REPAIR_ATTEMPTS, 3)
  };
}

const CONTEXT_GUARDRAILS = loadContextGuardrailsFromEnv();
const SYNTHESIS_LLM_CONFIG = loadSynthesisLlmConfigFromEnv();

const ANALYSIS_METHOD_GUIDELINE = [
  "分析方法要求（必须遵守）：",
  "1) 5W1H澄清：说明对象、目标、边界、约束、时序与责任主体。",
  "2) MECE分解：将结论拆成互斥且完整的结构，不得重复堆砌。",
  "3) 证据链：每个关键结论至少给出一个附件证据或路径证据。",
  "4) 风险与反证：识别假设、风险、未知项，并给出验证动作。",
  "5) 可执行输出：结论必须可直接用于任务拆解、开发、测试或发布决策。"
].join("\n");

function withAnalysisMethodology(prompt: IterationAgentPrompt): IterationAgentPrompt {
  const methodBlock = `\n\n${ANALYSIS_METHOD_GUIDELINE}`;
  return {
    ...prompt,
    systemPrompt: `${prompt.systemPrompt}${methodBlock}`,
    userPrompt: `${prompt.userPrompt}${methodBlock}`
  };
}

async function runAnalysisPrompt(
  agentRunner: AgentRunner,
  prompt: IterationAgentPrompt,
  options?: AgentRunOptions
) {
  return agentRunner.run(withAnalysisMethodology(prompt), options);
}


async function synthesizeExecutionPolicyOp(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    fileName: string;
    sourceType: "single-file" | "folder";
    excerptPayload: ReturnType<typeof composeAttachmentExcerpt>;
    chunkCount: number;
    forceMultiAgentHint?: boolean;
  }
) {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const prompt = {
    agentId: "agent-execution-policy-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "决定本轮分析执行策略（是否降级、是否单Agent）",
    expectedOutput: "JSON: {degraded,reason,enforceSingleAgent,forceMultiAgent,promptBudgetRisk}",
    systemPrompt:
      "你是LLM编排策略器。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释。根据上下文规模和信息质量判断执行策略。",
    userPrompt: [
      `iteration=${params.iterationName};file=${params.fileName};sourceType=${params.sourceType}`,
      `strategy=${params.excerptPayload.strategy};digest=${params.excerptPayload.digest}`,
      `fileStats=total:${params.excerptPayload.fileStats.totalFiles},text:${params.excerptPayload.fileStats.textFiles},binary:${params.excerptPayload.fileStats.binaryFiles}`,
      `fileSelection=considered:${params.excerptPayload.fileSelection.consideredFiles},included:${params.excerptPayload.fileSelection.includedFiles},sampled:${params.excerptPayload.fileSelection.sampled ? "yes" : "no"}`,
      `excerptLength=${params.excerptPayload.text.length};chunkCount=${params.chunkCount}`,
      `forceMultiAgentHint=${params.forceMultiAgentHint ? "yes" : "no"}`,
      `textPreview=${params.excerptPayload.text.slice(0, 1800) || "-"}`,
      "输出要求：",
      "1) degraded: true/false",
      "2) reason: 简要原因",
      "3) enforceSingleAgent: true/false",
      "4) forceMultiAgent: true/false",
      "5) promptBudgetRisk: low/medium/high"
    ].join("\n\n")
  };
  let selected = await runAnalysisPrompt(agentRunner, prompt);
  let candidate = parseExecutionPolicyCandidate(selected.content);
  let missing = listExecutionPolicyMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-execution-policy-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "请仅输出严格 JSON 并修复以下问题：",
        missing.join("; "),
        `上一版输出：${selected.content.slice(0, 1600)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseExecutionPolicyCandidate(selected.content);
    missing = listExecutionPolicyMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../../infrastructure/runtime/logger")).createLogger("exec-policy");
    log.warn("execution policy incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}

async function synthesizeFolderSelectionOp(
  agentRunner: AgentRunner | null,
  input: AttachmentUploadInput
): Promise<FolderSelectionDecision> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const files = Array.isArray(input.files) ? input.files : [];
  const manifest = files
    .slice(0, 600)
    .map((item, index) => {
      const path = (item.path || item.fileName || "").trim();
      const mime = (item.mimeType || "application/octet-stream").trim();
      const size = Number.isFinite(item.size) ? item.size : 0;
      const excerpt = (item.excerpt || "").trim().slice(0, 200);
      return `[${index + 1}] path=${path};mime=${mime};size=${size};excerpt=${excerpt || "[empty]"}`;
    })
    .join("\n");
  const prompt = {
    agentId: "agent-folder-selection-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "选择本轮分析应纳入的文件",
    expectedOutput: "JSON: {includedPaths:[], ignoredFiles:[{path,reason}], sampleReason}",
    systemPrompt:
      "你是分析上下文策展器。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文本。基于业务价值、可解析性和版本相关性选择文件。",
    userPrompt: [
      `folder=${input.folderName || input.fileName || "folder"}`,
      `totalFiles=${files.length}`,
      "请从以下文件清单中选出应纳入本轮分析的文件路径 includedPaths。",
      "忽略的文件请写入 ignoredFiles，并给出 reason。",
      "file manifest:",
      manifest
    ].join("\n\n")
  };
  let selected = await runAnalysisPrompt(agentRunner, prompt);
  let candidate = parseFolderSelectionCandidate(selected.content);
  let missing = listFolderSelectionMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-folder-selection-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出缺少必填项，请仅输出严格 JSON。",
        `缺失项：${missing.join("; ")}`,
        `上一版输出：${selected.content.slice(0, 2000)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseFolderSelectionCandidate(selected.content);
    missing = listFolderSelectionMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../../infrastructure/runtime/logger")).createLogger("folder-select");
    log.warn("folder selection incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}


async function synthesizeDeepInsightsOp(
  agentRunner: AgentRunner | null,
  params: {
    input: AttachmentUploadInput;
    excerptPayload: ReturnType<typeof composeAttachmentExcerpt>;
    prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
    clarificationQuestions: string[];
  }
) {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const fileManifest = buildDeepInsightsFileManifest(params.input);
  const prompt = {
    agentId: "agent-deep-insights-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "生成逐文件深度洞察与跨文件综合洞察",
    expectedOutput:
      "JSON: {coverage:{consideredFiles,analyzedFiles,partialFiles,failedFiles,coveragePercent}, fileInsights:[{path,fileName,mimeType,size,kind,status,mainContent,requiredWork,iterationValue,summary,keyPoints,risks,optimizeItems,keepItems,recommendedActions,openQuestions,citations,confidence}], crossFileInsights:{themes,conflicts,gaps,recommendations,conflictChains,rootCauses,impactScope,decisionSuggestions}}",
    systemPrompt:
      "你是资深需求分析师。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文字。逐文件洞察必须基于输入文件内容，不得虚构。",
    userPrompt: [
      `sourceType=${params.input.sourceType === "folder" ? "folder" : "single-file"};target=${params.input.fileName}`,
      `digest=${params.excerptPayload.digest}`,
      `prioritizedFindings=${params.prioritizedFindings.map((item) => `${item.priority}:${item.content}`).join(" | ") || "-"}`,
      `clarificationQuestions=${params.clarificationQuestions.join(" | ") || "-"}`,
      `files:\n${fileManifest}`,
      "输出要求：",
      "1) fileInsights 必须覆盖输入文件（可对信息不足文件给 partial/failed）。",
      "2) kind 仅允许 document/code/image/prototype/binary。",
      "3) status 仅允许 analyzed/partial/failed。",
      "4) confidence 仅允许 high/medium/low。",
      "5) 每个文件必须回答：mainContent(文件主要内容)、requiredWork(要做什么)、iterationValue(对当前迭代为何必要)。",
      "6) 每个文件给出 summary/keyPoints/risks/optimizeItems/keepItems/recommendedActions/openQuestions/citations。",
      "7) 如果是 HTML/原型，必须描述关键交互形态与状态变化。",
      "8) optimizeItems 必须是需优化内容，keepItems 必须是应保持内容。",
      "9) crossFileInsights 必须给出 themes/conflicts/gaps/recommendations/conflictChains/rootCauses/impactScope/decisionSuggestions。"
    ].join("\n\n")
  };
  let selected = await runAnalysisPrompt(agentRunner, prompt);
  let candidate = parseDeepInsightsCandidate(selected.content);
  let missing = listDeepInsightsMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-deep-insights-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出未满足必填字段，请仅输出严格 JSON 并补齐：",
        `缺失项：${missing.join("; ")}`,
        `上一版输出：${selected.content.slice(0, 2400)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt);
    candidate = parseDeepInsightsCandidate(selected.content);
    missing = listDeepInsightsMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../../infrastructure/runtime/logger")).createLogger("deep-insights");
    log.warn("deep insights incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}


async function executeAgentPlanOp(
  agentRunner: AgentRunner | null,
  prompts: ReturnType<typeof buildIterationAgentPlan>["prompts"],
  visionPayloads: VisionPayload[]
): Promise<IterationAgentOutput[]> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const parallelism = resolvePlanParallelismFromEnv(processEnv);
  return executeAgentPlanPromptsOp({
    prompts,
    parallelism,
    imageDataUrls: visionPayloads.map((item) => item.dataUrl),
    runPrompt: (prompt, options) => runAnalysisPrompt(agentRunner, prompt, options)
  });
}


async function synthesizeAttachmentInsightsOp(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    fileName: string;
    sourceType: "single-file" | "folder";
    excerpt: string;
    versionDiff: { added: string[]; changed: string[]; removed: string[] };
    diffLocations: AttachmentAnalysisReport["diffLocations"];
    visionPayloads?: VisionPayload[];
  }
) {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const prompt = {
    agentId: "agent-attachment-insights-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "输出附件洞察摘要",
    expectedOutput: "JSON: {projectCategory,artifactType,keyCharacteristics[],versionChangeSummary,confidence,limitations[]}",
    systemPrompt:
      "你是产品分析专家。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，不得输出解释文本。confidence 只能是 high/medium/low。",
    userPrompt: [
      `iteration=${params.iterationName};file=${params.fileName};sourceType=${params.sourceType}`,
      `diff=added:${params.versionDiff.added.join(" | ") || "-"};changed:${params.versionDiff.changed.join(" | ") || "-"};removed:${params.versionDiff.removed.join(" | ") || "-"}`,
      `diffLocations=${params.diffLocations.map((item) => `${item.dimension}/${item.changeType}:${item.baselineItem || "-"}->${item.currentItem}`).join(" | ") || "-"}`,
      `excerpt=${params.excerpt.slice(0, 2600) || "-"}`,
      "输出要求：projectCategory、artifactType、keyCharacteristics(1-8)、versionChangeSummary、confidence、limitations(0-8)。"
    ].join("\n\n")
  };
  const imageDataUrls = (params.visionPayloads || []).map((item) => item.dataUrl).filter(Boolean);
  let selected = await runAnalysisPrompt(agentRunner, prompt, { imageDataUrls });
  let candidate = parseAttachmentInsightsCandidate(selected.content);
  let missing = listAttachmentInsightsMissingReasons(candidate);
  for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
    const repairPrompt = {
      ...prompt,
      agentId: `agent-attachment-insights-repair-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "请仅输出严格 JSON 并补齐以下缺失项：",
        missing.join("; "),
        `上一版输出：${selected.content.slice(0, 2200)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt, { imageDataUrls });
    candidate = parseAttachmentInsightsCandidate(selected.content);
    missing = listAttachmentInsightsMissingReasons(candidate);
  }
  if (missing.length > 0) {
    const log = (await import("../../infrastructure/runtime/logger")).createLogger("attach-insights");
    log.warn("attachment insights incomplete", { missing: missing.join(", ") });
  }
  return candidate;
}

function applyLifecycleTransitionOp(
  transitionIteration: (
    iterationId: number,
    toStatus: IterationStatus,
    input: { source: IterationTransitionSource; reason: string; operator: string; operatorRole: string }
  ) => { ok: boolean; reason?: string },
  iterationId: number,
  fromStatus: IterationStatus,
  toStatus: IterationStatus | null,
  autoTransition: boolean
) {
  if (!toStatus || toStatus === fromStatus) {
    return { attempted: false, applied: false, fromStatus, toStatus, note: "推荐状态与当前一致，未触发自动流转。" };
  }
  if (!autoTransition) {
    return { attempted: false, applied: false, fromStatus, toStatus, note: `已生成状态流转建议 ${fromStatus} -> ${toStatus}，等待手动确认。` };
  }
  const result = transitionIteration(iterationId, toStatus, {
    source: "auto",
    reason: "Agent 自动驱动流转",
    operator: "agent-runner",
    operatorRole: "system"
  });
  if (result.ok) {
    return { attempted: true, applied: true, fromStatus, toStatus, note: `已自动流转：${fromStatus} -> ${toStatus}` };
  }
  return { attempted: true, applied: false, fromStatus, toStatus, note: `自动流转失败：${result.reason || "unknown"}` };
}

export async function analyzeAttachmentOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  transitionIteration: (
    iterationId: number,
    toStatus: IterationStatus,
    input: { source: IterationTransitionSource; reason: string; operator: string; operatorRole: string }
  ) => { ok: boolean; reason?: string },
  iterationId: number,
  input: AttachmentUploadInput
): Promise<AttachmentAnalysisReport | null> {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const previous = repo.findPreviousIteration(normalized);
  const previousScope = previous?.scope.inScope ?? [];
  const currentScope = normalized.scope.inScope;
  const folderSelection =
    input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
      ? await synthesizeFolderSelectionOp(agentRunner, input)
      : null;
  const excerptPayload = composeAttachmentExcerpt(input, CONTEXT_GUARDRAILS, folderSelection);
  const visionPayloads = resolveVisionPayloads(input);
  const added = currentScope.filter((item) => !previousScope.includes(item));
  const removed = previousScope.filter((item) => !currentScope.includes(item));
  const diffLocations = buildDiffLocations(previous ? normalizeIteration(previous) : null, normalized);
  const changed = diffLocations.filter((item) => item.changeType === "changed").map((item) => `${item.dimension}: ${item.currentItem}`);
  const normalizedRisks = normalized.assessment.risks.filter((item) => !isLowSignalText(item));
  const executionPolicy = await synthesizeExecutionPolicyOp(agentRunner, {
    iterationName: normalized.name,
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerptPayload,
    chunkCount: Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0,
    forceMultiAgentHint: input.forceMultiAgent
  });
  const finalContextGuardrail = {
    degraded: executionPolicy.degraded,
    reason: executionPolicy.reason
  };
  const files = Array.isArray(input.files) ? input.files : [];
  const totalFiles = input.sourceType === "folder" ? files.length : 1;
  const hasPrototypeEvidence =
    visionPayloads.length > 0 ||
    files.some((item) => {
      const mime = (item.mimeType || "").toLowerCase();
      const path = (item.path || item.fileName || "").toLowerCase();
      return mime.startsWith("image/") || /prototype|figma|sketch|xd/.test(path);
    });
  const hasDocumentEvidence =
    files.length === 0 ||
    files.some((item) => {
      const mime = (item.mimeType || "").toLowerCase();
      const path = (item.path || item.fileName || "").toLowerCase();
      return (
        mime.includes("text") ||
        mime.includes("json") ||
        mime.includes("xml") ||
        mime.includes("markdown") ||
        /\.(md|mdx|txt|doc|docx|pdf|ppt|pptx|xlsx|csv|json|yml|yaml)$/i.test(path)
      );
    });
  const finalAgentPlan = buildIterationAgentPlan({
    iteration: normalized,
    previous: previous ? normalizeIteration(previous) : null,
    scope: input.agentScope ?? "full-cycle",
    diffLocations,
    risks: normalizedRisks,
    fileName: input.fileName,
    attachmentMeta: { strategy: excerptPayload.strategy, digest: excerptPayload.digest, textPreview: excerptPayload.text },
    attachmentSignals: {
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      hasPrototypeEvidence,
      hasDocumentEvidence,
      totalFiles
    }
  });
  const agentOutputs = await executeAgentPlanOp(agentRunner, finalAgentPlan.prompts, visionPayloads);
  const unknownSignalCount = agentOutputs.reduce((total, output) => total + (output.content.toLowerCase().match(/unknown/g)?.length ?? 0), 0);
  const generatedTestMatrix = extractGeneratedTestMatrix(agentOutputs);
  const qualityArtifacts = extractGeneratedQualityArtifacts(agentOutputs);
  const uxArtifacts = extractUxArtifacts(agentOutputs);
  const boundarySuggestion = extractBoundarySuggestion(agentOutputs);
  const releaseOpsActions = extractReleaseOpsActions(agentOutputs);
  const clarificationQuestions = buildClarificationQuestionsOp({
    guardrail: finalContextGuardrail,
    unknownSignalCount,
    unknownSignalThreshold: CONTEXT_GUARDRAILS.unknownSignalThreshold,
    strategy: excerptPayload.strategy,
    diffLocations
  });
  const llmPromptContextLength = finalAgentPlan.prompts.reduce((total, prompt) => total + prompt.systemPrompt.length + prompt.userPrompt.length, 0);
  const finalLifecycleAction = applyLifecycleTransitionOp(transitionIteration, iterationId, normalized.status, finalAgentPlan.recommendedTransition, input.autoTransition === true);
  const currentChangeControl = normalized.changeControl ?? defaultIterationChangeControl();
  const currentBoundary = currentChangeControl.boundary ?? defaultIterationChangeControl().boundary;
  const boundaryIsEmpty =
    currentBoundary.requirementRefs.length === 0 &&
    currentBoundary.componentRefs.length === 0 &&
    currentBoundary.codePaths.length === 0 &&
    !currentBoundary.note;
  const resolvedBoundary =
    boundarySuggestion && boundaryIsEmpty
      ? {
          requirementRefs: boundarySuggestion.requirementRefs,
          componentRefs: boundarySuggestion.componentRefs,
          codePaths: boundarySuggestion.codePaths,
          note: boundarySuggestion.note || "由 boundary-guardian 自动建议，待人工确认。",
          updatedAt: new Date().toISOString()
        }
      : currentBoundary;
  const generatedAt = new Date().toISOString();
  const existingMaterializedFiles = Array.isArray(currentChangeControl.qualityArtifacts?.materializedFiles)
    ? currentChangeControl.qualityArtifacts.materializedFiles
    : [];
  const resolvedQualityArtifacts = {
    ...qualityArtifacts,
    materializedFiles: existingMaterializedFiles
  };
  let executableConstraintsState = {
    componentWhitelist: resolvedBoundary.componentRefs.slice(0, 24),
    codePathWhitelist: resolvedBoundary.codePaths.slice(0, 24),
    acceptanceChecks: Array.from(new Set([...normalized.scope.acceptanceCriteria, ...qualityArtifacts.acceptanceChecklist])).slice(0, 24)
  };
  let executableConstraints = {
    ...executableConstraintsState,
    gateRules: [
      "仅允许改动 codePathWhitelist 内文件。",
      "发布前测试矩阵不得存在 failed/blocked。",
      "生产环境需 releaseReview=go 且验收清单非空。"
    ]
  };
  normalized.changeControl = {
    ...currentChangeControl,
    pendingHumanConfirmation: true,
    lastAnalysisAt: generatedAt,
    lastAnalysisFileName: input.fileName,
    lastAnalysisDigest: `added=${added.length};removed=${removed.length};diff=${diffLocations.length};strategy=${excerptPayload.strategy};chunks=${Array.isArray(input.excerptChunks) ? input.excerptChunks.length : 0};degraded=${finalContextGuardrail.degraded ? "yes" : "no"}${finalContextGuardrail.reason ? `;reason=${finalContextGuardrail.reason}` : ""};policyRisk=${executionPolicy.promptBudgetRisk}`,
    clarificationQuestions,
    clarificationDraftResolvedQuestions: [],
    clarificationDraftUpdatedAt: generatedAt,
    lastClarificationResolution: { resolvedQuestions: [], unresolvedQuestions: clarificationQuestions, updatedAt: generatedAt },
    lastClarificationNote: "",
    confirmedAt: "",
    confirmedBy: "",
    boundary: resolvedBoundary,
    generatedTestMatrix,
    generatedTestMatrixUpdatedAt: generatedTestMatrix.length > 0 ? generatedAt : "",
    testMatrixExecutionUpdatedAt: "",
    qualityArtifacts: {
      ...resolvedQualityArtifacts,
      updatedAt: generatedAt
    },
    uxArtifacts: {
      ...uxArtifacts,
      updatedAt: generatedAt
    },
    executableConstraints: {
      ...executableConstraintsState,
      generatedAt
    }
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "attachment_analyzed", `iteration:${iterationId}`, `分析附件 ${input.fileName}`);
  if (generatedTestMatrix.length > 0) {
    writeAuditLog(repo, "iteration_test_matrix_generated", `iteration:${iterationId}`, `cases=${generatedTestMatrix.length}`);
  }
  const attachmentInsights = await synthesizeAttachmentInsightsOp(agentRunner, {
    iterationName: normalized.name,
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    excerpt: excerptPayload.text,
    versionDiff: { added, changed, removed },
    diffLocations,
    visionPayloads
  });
  const synthesis = await synthesizeProjectProfileOp(
    agentRunner,
    {
      iterationName: normalized.name,
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
      excerpt: excerptPayload.text,
      fileStats: excerptPayload.fileStats,
      versionDiff: { added, changed, removed },
      agentOutputs,
      contextLabel: "primary",
      visionPayloads
    },
    { runAnalysisPrompt, synthesisLlmConfig: SYNTHESIS_LLM_CONFIG }
  );
  const batchSyntheses = excerptPayload.batchContexts.length
    ? await Promise.all(
        excerptPayload.batchContexts.map((batchContext, index) =>
          synthesizeProjectProfileOp(
            agentRunner,
            {
              iterationName: normalized.name,
              sourceType: input.sourceType === "folder" ? "folder" : "single-file",
              analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
              excerpt: batchContext,
              fileStats: excerptPayload.fileStats,
              versionDiff: { added, changed, removed },
              agentOutputs,
              contextLabel: `batch-${index + 1}`,
              visionPayloads
            },
            { runAnalysisPrompt, synthesisLlmConfig: SYNTHESIS_LLM_CONFIG }
          )
        )
      )
    : [];
  const mergedSynthesis = mergeSynthesisResultsOp(
    {
      projectDetection: {
        ...synthesis.projectDetection,
        confidence: synthesis.projectDetection.confidence || "low"
      },
      meaningfulFindings: synthesis.meaningfulFindings,
      prioritizedFindings: synthesis.prioritizedFindings,
      nextActions: synthesis.nextActions
    },
    batchSyntheses
  );
  const resolvedProjectDetectionWithPaths = {
    ...mergedSynthesis.projectDetection,
    evidence: Array.from(new Set(mergedSynthesis.projectDetection.evidence)).slice(0, 5)
  };
  const resolvedMeaningfulFindings = mergedSynthesis.meaningfulFindings;
  const resolvedPrioritizedFindings = mergedSynthesis.prioritizedFindings;
  const resolvedNextActions = mergedSynthesis.nextActions;
  const finalNextActions = Array.from(new Set([...resolvedNextActions, ...releaseOpsActions].map((item) => item.trim()).filter(Boolean))).slice(0, 12);
  const deepInsights = await synthesizeDeepInsightsOp(agentRunner, {
    input,
    excerptPayload,
    prioritizedFindings: resolvedPrioritizedFindings,
    clarificationQuestions
  });
  const resolvedBoundaryForReport = normalized.changeControl?.boundary ?? currentChangeControl.boundary;
  const businessConfirmation = await synthesizeBusinessConfirmationOp(
    agentRunner,
    {
      iterationName: normalized.name,
      baselineIterationName: previous?.name ?? "无基线",
      analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      excerpt: excerptPayload.text,
      requirements:
        resolvedBoundaryForReport?.requirementRefs?.length > 0
          ? resolvedBoundaryForReport.requirementRefs
          : normalized.scope.inScope.slice(0, 12),
      components: resolvedBoundaryForReport?.componentRefs ?? [],
      codePaths: resolvedBoundaryForReport?.codePaths ?? [],
      clarificationQuestions,
      versionDiff: { added, changed, removed },
      diffLocations,
      prioritizedFindings: resolvedPrioritizedFindings,
      visionPayloads
    },
    { runAnalysisPrompt }
  );
  const businessConfirmationWithUx = {
    ...businessConfirmation,
    interactionInsights: {
      ...businessConfirmation.interactionInsights,
      primaryFlow: Array.from(new Set([...businessConfirmation.interactionInsights.primaryFlow, ...uxArtifacts.interactionFlows])).slice(0, 12),
      keyInteractions: Array.from(new Set([...businessConfirmation.interactionInsights.keyInteractions, ...uxArtifacts.uxConstraints])).slice(0, 14),
      exceptionPaths: Array.from(new Set([...businessConfirmation.interactionInsights.exceptionPaths, ...uxArtifacts.uiStates])).slice(0, 12)
    }
  };
  const reportQuality = await synthesizeReportQualityGateOp(
    agentRunner,
    {
      iterationName: normalized.name,
      analyzedTarget: input.sourceType === "folder" ? (input.folderName?.trim() || input.fileName) : input.fileName,
      sourceType: input.sourceType === "folder" ? "folder" : "single-file",
      deepInsights,
      businessConfirmation: businessConfirmationWithUx,
      prioritizedFindings: resolvedPrioritizedFindings,
      clarificationQuestions
    },
    { runAnalysisPrompt }
  );
  const releaseOpsStructured = extractReleaseOpsStructured(agentOutputs);
  const qaReleaseReview = extractReleaseReview(agentOutputs);
  const governanceInsights = await synthesizeGovernanceInsightsOp(
    agentRunner,
    {
      iterationName: normalized.name,
      baselineIterationName: previous?.name ?? "无基线",
      excerpt: excerptPayload.text,
      diffLocations,
      added,
      changed,
      removed,
      requirements:
        resolvedBoundaryForReport?.requirementRefs?.length > 0
          ? resolvedBoundaryForReport.requirementRefs
          : normalized.scope.inScope.slice(0, 8),
      components: resolvedBoundaryForReport?.componentRefs ?? [],
      codePaths: resolvedBoundaryForReport?.codePaths ?? [],
      prioritizedFindings: resolvedPrioritizedFindings,
      clarificationQuestions
    },
    { runAnalysisPrompt }
  );
  const traceabilityMap = governanceInsights.traceabilityMap;
  const domainKnowledge = governanceInsights.domainKnowledge;
  const versionDiffDetailed = governanceInsights.versionDiffDetailed;
  executableConstraints = governanceInsights.executableConstraints;
  executableConstraintsState = {
    componentWhitelist: executableConstraints.componentWhitelist.slice(0, 24),
    codePathWhitelist: executableConstraints.codePathWhitelist.slice(0, 24),
    acceptanceChecks: executableConstraints.acceptanceChecks.slice(0, 24)
  };
  const opsRollbackReason = releaseOpsStructured.rollbackDecision.reason;
  const opsRollbackTrigger = releaseOpsStructured.rollbackDecision.trigger;
  const releaseReviewSynthesized = await synthesizeReleaseReviewOp(
    agentRunner,
    {
      iterationName: normalized.name,
      excerpt: excerptPayload.text,
      prioritizedFindings: resolvedPrioritizedFindings,
      blockers: qaReleaseReview.blockers,
      releaseGates: qaReleaseReview.releaseGates,
      rollbackPlan: qaReleaseReview.rollbackPlan,
      recommendations: finalNextActions.slice(0, 8),
      qualitySignals: {
        testCaseCount: generatedTestMatrix.length,
        p0FindingCount: resolvedPrioritizedFindings.filter((item) => item.priority === "P0").length,
        unknownSignalCount,
        boundaryCoverage: traceabilityMap.coverageScore
      }
    },
    { runAnalysisPrompt }
  );
  const releaseReview = {
    decision: releaseReviewSynthesized.decision,
    reason: releaseReviewSynthesized.reason,
    blockers: releaseReviewSynthesized.blockers,
    releaseGates: releaseReviewSynthesized.releaseGates,
    recommendations: releaseReviewSynthesized.recommendations,
    rollback: {
      shouldRollback: releaseReviewSynthesized.rollback.shouldRollback,
      reason: releaseReviewSynthesized.rollback.reason || opsRollbackReason,
      trigger: releaseReviewSynthesized.rollback.trigger || opsRollbackTrigger,
      actions: releaseReviewSynthesized.rollback.actions
    },
    qualitySignals: releaseReviewSynthesized.qualitySignals
  };
  const releaseReviewScore = releaseReviewSynthesized.score;
  const opsRollbackLabel = releaseReview.rollback.shouldRollback ? "建议回滚" : "暂不回滚";
  const opsRollbackReasonText = releaseReview.rollback.reason ? `（${releaseReview.rollback.reason}）` : "";
  const opsTriage = {
    hypotheses: releaseOpsStructured.hypotheses,
    triageSteps: releaseOpsStructured.triageSteps,
    rollbackSuggestion: `回滚建议：${opsRollbackLabel}${opsRollbackReasonText}`
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
    lastReleaseReviewScore: releaseReviewScore,
    lastReleaseReviewUpdatedAt: generatedAt,
    lastTraceabilityCoverageScore: traceabilityMap.coverageScore,
    lastOpsRollbackSuggested: releaseReview.rollback.shouldRollback,
    lastReportPublishable: reportQuality.publishable,
    lastReportQualityScore: reportQuality.score,
    lastReportQualitySummary: reportQuality.summary,
    lastReportQualityUpdatedAt: generatedAt,
    uxArtifacts: {
      ...uxArtifacts,
      updatedAt: generatedAt
    },
    executableConstraints: {
      ...executableConstraintsState,
      generatedAt
    },
    traceabilitySnapshot: {
      requirementCoverage: traceabilityMap.coverageScore,
      mappingConfidence: traceabilityMap.mappingConfidence,
      unmappedRequirements: traceabilityMap.unmappedRequirements,
      conflicts: traceabilityMap.conflicts,
      generatedAt
    },
    domainKnowledgeEntries: domainKnowledge.terms.map((item) => ({
      term: item.term,
      definition: item.definition,
      mappedPages: item.mappedTo.pages,
      mappedApis: item.mappedTo.apis,
      mappedEntities: item.mappedTo.entities,
      mappedCodePaths: item.mappedTo.codePaths,
      evidence: item.evidence
    })),
    domainKnowledgeUpdatedAt: generatedAt
  };
  repo.updateIteration(normalized);
  writeAuditLog(repo, "attachment_project_detection_synthesized", `iteration:${iterationId}`, `target=${input.fileName}`);
  const synthesisOutputs = [
    synthesis.synthesisOutput,
    ...batchSyntheses.map((item) => item.synthesisOutput)
  ].filter(Boolean) as IterationAgentOutput[];
  const outputList = synthesisOutputs.length > 0 ? [...agentOutputs, ...synthesisOutputs] : agentOutputs;
  const reportPayloadIssues = collectLlmBackedReportPayloadIssues({
    projectDetection: resolvedProjectDetectionWithPaths,
    meaningfulFindings: resolvedMeaningfulFindings,
    prioritizedFindings: resolvedPrioritizedFindings,
    nextActions: finalNextActions,
    businessConfirmation: businessConfirmationWithUx,
    reportQuality,
    outputList
  });
  if (reportPayloadIssues.length > 0) {
    throw new LlmInvocationError(`report_not_llm_quality: ${reportPayloadIssues.join(", ")}`);
  }
  const llmModels = Array.from(new Set(outputList.map((item) => (item.model || "").trim()).filter(Boolean)));
  const finalRisks = Array.from(
    new Set([
      ...versionDiffDetailed.riskPoints.filter((item) => !isLowSignalText(item)),
      ...resolvedPrioritizedFindings.filter((item) => item.priority === "P0" || item.priority === "P1").map((item) => item.reason).filter((item) => !isLowSignalText(item))
    ])
  ).slice(0, 12);
  const finalSuggestions = Array.from(
    new Set([
      ...reportQuality.actionRequired.filter((item) => !isLowSignalText(item)),
      ...releaseReview.recommendations.filter((item) => !isLowSignalText(item)),
      ...finalNextActions.filter((item) => !isLowSignalText(item)),
      ...releaseOpsActions.filter((item) => !isLowSignalText(item)),
      ...attachmentInsights.limitations.filter((item) => !isLowSignalText(item)),
      ...uxArtifacts.uxConstraints.filter((item) => !isLowSignalText(item))
    ])
  ).slice(0, 16);
  writeAuditLog(
    repo,
    "attachment_llm_trace",
    `iteration:${iterationId}`,
    `models=${llmModels.join("|") || "unknown"};outputs=${outputList.length};target=${input.fileName}`
  );
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
    analyzedAt: generatedAt,
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
    understanding: [
      businessConfirmationWithUx.coreIntent,
      businessConfirmationWithUx.versionDiffSummary,
      resolvedPrioritizedFindings.length > 0 ? `优先关注：${resolvedPrioritizedFindings[0].content}` : ""
    ]
      .filter((item) => item && item.trim().length > 0)
      .join(" "),
    versionDiff: { baselineIterationName: previous?.name ?? "无基线", added, changed, removed },
    versionDiffDetailed,
    diffLocations,
    cyclePhase: inferCyclePhase(normalized.status),
    agentPlan: finalAgentPlan,
    agentOutputs: outputList,
    lifecycleAction: finalLifecycleAction,
    risks: finalRisks,
    traceabilityMap,
    executableConstraints,
    releaseReview,
    qualityArtifacts: resolvedQualityArtifacts,
    uxArtifacts,
    domainKnowledge,
    opsTriage,
    businessConfirmation: businessConfirmationWithUx,
    deepInsights,
    reportQuality,
    suggestions: finalSuggestions
  };
}
