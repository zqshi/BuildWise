import { LlmInvocationError, LlmUnavailableError, type AgentRunOptions, type AgentRunResult, type AgentRunner } from '../shared/agentRunner';
import type { AttachmentAnalysisReport, IterationAgentOutput, IterationAgentPrompt, VisionPayload } from '../../../domain/workspace/types';
import { formatFileStats, formatSourceType, formatVersionDiff, isLowSignalText, parseJsonObjectFromText, pickStringList } from './extractors';
import {
  listProjectProfileMissingReasons,
  parsePrioritizedFindingsFromText,
  parseProjectDetectionFromText,
  parseProjectProfileCandidate
} from './projectProfileOps';
type SynthesisLlmConfig = {
  fallbackModels: string[];
  repairAttemptsSingleFile: number;
  repairAttemptsBatch: number;
  findingsRepairAttempts: number;
  projectDetectionRepairAttempts: number;
};

type RunAnalysisPrompt = (
  agentRunner: AgentRunner,
  prompt: IterationAgentPrompt,
  options?: AgentRunOptions
) => Promise<AgentRunResult>;

function buildProjectProfilePrompt(
  params: Parameters<typeof synthesizeProjectProfileOp>[1],
  compactOutputs: string,
  isCompactPrimaryContext: boolean
): IterationAgentPrompt {
  const synthesisRole: "requirements-analyst" | "orchestrator" = isCompactPrimaryContext ? "requirements-analyst" : "orchestrator";
  return {
    agentId: isCompactPrimaryContext ? "agent-report-synthesis-compact-1" : "agent-report-synthesis-1",
    role: synthesisRole,
    scope: "attachment" as const,
    goal: "识别项目/产品并输出高价值发现",
    expectedOutput:
      "JSON: {projectDetection:{projectName,productName,projectCategory,evidence[]}, meaningfulFindings:[...], prioritizedFindings:[{priority,content,reason}], nextActions:[...]}",
    systemPrompt: [
      isCompactPrimaryContext ? "你是资深需求分析师。" : "你是资深产品分析师。",
      "你必须只输出严格 JSON（不要用 ```json 包裹），不得输出任何解释文字。",
      "所有 JSON key 必须使用英文，严格遵循以下 schema：",
      '{"projectDetection":{"projectName":"...","productName":"...","projectCategory":"...","evidence":["..."]},"meaningfulFindings":["..."],"prioritizedFindings":[{"priority":"P0","content":"...","reason":"..."}],"nextActions":["..."]}',
      "priority 只允许 P0/P1/P2。输出必须具体、可证据化，禁止空泛话术。",
      "所有 string 类型字段的值必须使用中文业务语言，禁止出现：文件名路径、文件大小、英文技术缩写、前端后端框架名称。"
    ].join("\n"),
    userPrompt: [
      `分析目标：${params.analyzedTarget}`,
      `来源类型：${formatSourceType(params.sourceType)}`,
      `所属迭代：${params.iterationName}`,
      `上下文：${params.contextLabel || "主分析"}`,
      formatFileStats(params.fileStats),
      formatVersionDiff(params.versionDiff),
      `附件节选:\n${params.excerpt.slice(0, isCompactPrimaryContext ? 1600 : 2500) || "无"}`,
      isCompactPrimaryContext ? "" : `多Agent输出:\n${compactOutputs || "无"}`,
      isCompactPrimaryContext
        ? "请输出：1)projectDetection(projectName/productName/projectCategory/evidence<=3条) 2)meaningfulFindings(2-4条，必须具体且可验证) 3)prioritizedFindings(<=4条，每条含priority/content/reason) 4)nextActions(<=3条)。所有key必须英文。"
        : "请输出：1)projectDetection(projectName/productName/projectCategory/evidence<=4条) 2)meaningfulFindings(2-8条，必须具体且可验证) 3)prioritizedFindings(<=8条，每条含priority/content/reason) 4)nextActions(<=6条)。所有key必须英文。"
    ].join("\n\n")
  };
}

type SynthesisRunFn = (prompt: IterationAgentPrompt) => Promise<AgentRunResult>;

async function repairPrioritizedFindings(
  candidate: ReturnType<typeof parseProjectProfileCandidate>,
  runSynthesis: SynthesisRunFn,
  params: Parameters<typeof synthesizeProjectProfileOp>[1]
): Promise<ReturnType<typeof parseProjectProfileCandidate>> {
  if (candidate.prioritizedFindings.length > 0 || candidate.meaningfulFindings.length === 0) return candidate;
  const prompt = {
    agentId: "agent-report-prioritize-1",
    role: "orchestrator" as const,
    scope: "attachment" as const,
    goal: "基于关键发现输出优先级发现",
    expectedOutput: "JSON: {prioritizedFindings:[{priority,content,reason}]}",
    systemPrompt:
      '你是资深技术负责人。你必须只输出严格 JSON（不要用 ```json 包裹），不得输出解释文字。所有key必须英文。schema: {"prioritizedFindings":[{"priority":"P0","content":"...","reason":"..."}]}。priority 只能是 P0/P1/P2。',
    userPrompt: [
      `分析目标：${params.analyzedTarget}`,
      `所属迭代：${params.iterationName}`,
      `关键发现:\n${candidate.meaningfulFindings.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
      "请输出 prioritizedFindings（1-8条），每条包含 priority/content/reason。"
    ].join("\n\n")
  };
  const result = await runSynthesis(prompt);
  const prioritized = parsePrioritizedFindingsFromText(result.content);
  return prioritized.length > 0 ? { ...candidate, prioritizedFindings: prioritized } : candidate;
}

async function repairMeaningfulFindings(
  candidate: ReturnType<typeof parseProjectProfileCandidate>,
  lastContent: string,
  runSynthesis: SynthesisRunFn,
  params: Parameters<typeof synthesizeProjectProfileOp>[1],
  maxAttempts: number
): Promise<ReturnType<typeof parseProjectProfileCandidate>> {
  for (let attempt = 1; attempt <= maxAttempts && candidate.meaningfulFindings.length === 0; attempt += 1) {
    const prompt = {
      agentId: `agent-report-findings-${attempt}`,
      role: "orchestrator" as const,
      scope: "attachment" as const,
      goal: "基于上下文补齐关键发现",
      expectedOutput: "JSON: {meaningfulFindings:[...]}",
      systemPrompt:
        '你是资深产品分析师。你必须只输出严格 JSON（不要用 ```json 包裹），不得输出解释文字。所有key必须英文。schema: {"meaningfulFindings":["具体发现1","具体发现2"]}。meaningfulFindings 必须具体、可验证、避免空泛。',
      userPrompt: [
        `分析目标：${params.analyzedTarget}`,
      `所属迭代：${params.iterationName}`,
      `来源类型：${formatSourceType(params.sourceType)}`,
      `修复轮次：${attempt}`,
        `附件节选:\n${params.excerpt.slice(0, 2600) || "无"}`,
        `优先级发现:\n${candidate.prioritizedFindings.map((item, i) => `${i + 1}. ${item.priority} ${item.content}（${item.reason || "无原因"}）`).join("\n") || "无"}`,
        `上一版输出片段:\n${lastContent.slice(0, 1800) || "无"}`,
        "请输出 meaningfulFindings（2-8条），每条需具备可验证证据、影响对象、建议动作三个要素。"
      ].join("\n\n")
    };
    const result = await runSynthesis(prompt);
    const parsed = parseJsonObjectFromText(result.content);
    const findings = pickStringList(parsed?.meaningfulFindings, 8);
    if (findings.length > 0) return { ...candidate, meaningfulFindings: findings };
  }
  return candidate;
}

async function repairProjectDetection(
  candidate: ReturnType<typeof parseProjectProfileCandidate>,
  lastContent: string,
  runSynthesis: SynthesisRunFn,
  params: Parameters<typeof synthesizeProjectProfileOp>[1],
  maxAttempts: number
): Promise<ReturnType<typeof parseProjectProfileCandidate>> {
  for (let attempt = 1; attempt <= maxAttempts && !candidate.projectName && !candidate.productName; attempt += 1) {
    const prompt = {
      agentId: `agent-report-project-detection-${attempt}`,
      role: "orchestrator" as const,
      scope: "attachment" as const,
      goal: "补齐项目与产品识别",
      expectedOutput: "JSON: {projectDetection:{projectName,productName,projectCategory,evidence[]}}",
      systemPrompt:
        '你是资深产品分析师。你必须只输出严格 JSON（不要用 ```json 包裹），不得输出解释文字。所有key必须英文。schema: {"projectDetection":{"projectName":"...","productName":"...","projectCategory":"...","evidence":["..."]}}。projectName 或 productName 至少一个非空。',
      userPrompt: [
        `分析目标：${params.analyzedTarget}`,
      `所属迭代：${params.iterationName}`,
      `来源类型：${formatSourceType(params.sourceType)}`,
      `修复轮次：${attempt}`,
        `附件节选:\n${params.excerpt.slice(0, 2600) || "无"}`,
        formatVersionDiff(params.versionDiff),
        `上一版输出片段:\n${lastContent.slice(0, 2000) || "无"}`,
        "请仅输出 projectDetection，要求 evidence 1-4 条，且 projectName/productName 至少一个非空。"
      ].join("\n\n")
    };
    const result = await runSynthesis(prompt);
    const det = parseProjectDetectionFromText(result.content);
    if (det.projectName || det.productName) {
      return {
        ...candidate,
        projectName: det.projectName || candidate.projectName,
        productName: det.productName || candidate.productName,
        projectCategory: det.projectCategory || candidate.projectCategory,
        evidence: det.evidence.length > 0 ? det.evidence : candidate.evidence
      };
    }
  }
  return candidate;
}

async function warnIncompleteProfile(candidate: ReturnType<typeof parseProjectProfileCandidate>) {
  const warnings: string[] = [];
  if (candidate.meaningfulFindings.length === 0) warnings.push("关键发现为空");
  if (candidate.prioritizedFindings.length === 0) warnings.push("优先级发现为空");
  if (candidate.nextActions.length === 0) warnings.push("下一步行动为空");
  if (candidate.meaningfulFindings.every(isLowSignalText)) warnings.push("关键发现信息量不足");
  if (candidate.nextActions.every(isLowSignalText)) warnings.push("下一步行动信息量不足");
  if (warnings.length > 0) {
    const log = (await import("../../../infrastructure/runtime/logger")).createLogger("proj-profile");
    log.warn("project profile partially incomplete", { warnings: warnings.join(", ") });
  }
}

function buildProfileResult(
  candidate: ReturnType<typeof parseProjectProfileCandidate>,
  prompt: IterationAgentPrompt,
  selectedResult: AgentRunResult
) {
  const confidence: "high" | "medium" | "low" = candidate.evidence.length >= 3 ? "high" : candidate.evidence.length >= 1 ? "medium" : "low";
  return {
    projectDetection: {
      projectName: candidate.projectName, productName: candidate.productName,
      projectCategory: candidate.projectCategory, evidence: candidate.evidence, confidence
    },
    meaningfulFindings: candidate.meaningfulFindings,
    prioritizedFindings: candidate.prioritizedFindings,
    nextActions: candidate.nextActions,
    synthesisOutput: {
      agentId: prompt.agentId, role: prompt.role, status: "success" as const,
      content: selectedResult.content, model: selectedResult.model
    }
  };
}

export async function synthesizeProjectProfileOp(
  agentRunner: AgentRunner | null,
  params: {
    iterationName: string;
    sourceType: "single-file" | "folder";
    analyzedTarget: string;
    excerpt: string;
    fileStats: { totalFiles: number; textFiles: number; binaryFiles: number };
    versionDiff: { added: string[]; changed: string[]; removed: string[] };
    agentOutputs: IterationAgentOutput[];
    contextLabel?: string;
    visionPayloads?: VisionPayload[];
    contextMode?: "primary" | "supplemental";
  },
  deps: {
    runAnalysisPrompt: RunAnalysisPrompt;
    synthesisLlmConfig: SynthesisLlmConfig;
  }
): Promise<{
  projectDetection: AttachmentAnalysisReport["projectDetection"];
  meaningfulFindings: string[];
  prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
  nextActions: string[];
  synthesisOutput?: IterationAgentOutput;
}> {
  const isSupplementalContext = params.contextMode === "supplemental";
  const isCompactPrimaryContext =
    !isSupplementalContext && params.sourceType === "single-file" && params.fileStats.totalFiles <= 1;
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL) before calling analysis.");
  }
  const compactOutputLength = params.sourceType === "single-file" ? 320 : 520;
  const compactOutputs = params.agentOutputs
    .slice(0, 6)
    .map((item) => `[${item.role}] 状态：${item.status}\n${(item.content || "").slice(0, compactOutputLength)}`)
    .join("\n\n---\n\n");
  const prompt = buildProjectProfilePrompt(params, compactOutputs, isCompactPrimaryContext);

  try {
    const imageDataUrls = (params.visionPayloads || []).map((item) => item.dataUrl).filter(Boolean);
    const modelCandidates = Array.from(new Set(["", ...deps.synthesisLlmConfig.fallbackModels]));
    let llmAttemptCount = 0;
    const runSynthesis: SynthesisRunFn = async (nextPrompt) => {
      llmAttemptCount += 1;
      const modelRaw = modelCandidates[(llmAttemptCount - 1) % modelCandidates.length] || "";
      return deps.runAnalysisPrompt(agentRunner, nextPrompt, { imageDataUrls, modelOverride: modelRaw.trim() || undefined });
    };

    let selectedResult = await runSynthesis(prompt);
    let candidate = parseProjectProfileCandidate(selectedResult.content);
    let missingReasons = listProjectProfileMissingReasons(candidate);
    const maxRepairAttempts = isCompactPrimaryContext
      ? deps.synthesisLlmConfig.repairAttemptsSingleFile
      : deps.synthesisLlmConfig.repairAttemptsBatch;
    const effectiveRepairAttempts = isSupplementalContext || isCompactPrimaryContext ? Math.min(1, maxRepairAttempts) : maxRepairAttempts;
    for (let attempt = 1; attempt <= effectiveRepairAttempts && missingReasons.length > 0; attempt += 1) {
      const repairPrompt = {
        ...prompt,
        agentId: `agent-report-synthesis-repair-${attempt}`,
        userPrompt: [
          prompt.userPrompt,
          "你上一版输出不满足必填字段约束。请只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，且必须满足：",
          "输出的 JSON 字符串值必须使用中文业务语言，禁止引用 JSON key 名称。",
          "1) projectDetection.projectName 或 projectDetection.productName 至少一个非空",
          "2) meaningfulFindings 至少 2 条（string数组），且每条需明确证据或可验证动作",
          "3) prioritizedFindings 至少 1 条（对象数组，每个含英文key: priority/content/reason），priority 仅允许 P0/P1/P2",
          "4) nextActions 至少 1 条（string数组）",
          'schema示例: {"projectDetection":{"projectName":"X","productName":"Y","projectCategory":"Z","evidence":["..."]},"meaningfulFindings":["..."],"prioritizedFindings":[{"priority":"P0","content":"...","reason":"..."}],"nextActions":["..."]}',
          `本次缺失项：${missingReasons.join("; ")}`,
          `上一版输出：\n${selectedResult.content.slice(0, 2400)}`
        ].join("\n\n")
      };
      selectedResult = await runSynthesis(repairPrompt);
      candidate = parseProjectProfileCandidate(selectedResult.content);
      missingReasons = listProjectProfileMissingReasons(candidate);
    }

    if (!isSupplementalContext && !isCompactPrimaryContext) {
      candidate = await repairPrioritizedFindings(candidate, runSynthesis, params);
      candidate = await repairMeaningfulFindings(candidate, selectedResult.content, runSynthesis, params, deps.synthesisLlmConfig.findingsRepairAttempts);
      candidate = await repairProjectDetection(candidate, selectedResult.content, runSynthesis, params, deps.synthesisLlmConfig.projectDetectionRepairAttempts);
    }

    if (!isSupplementalContext && !candidate.projectName && !candidate.productName) {
      throw new LlmInvocationError("LLM 合成结果缺失关键字段：项目名称或产品名称未识别");
    }
    await warnIncompleteProfile(candidate);
    return buildProfileResult(candidate, prompt, selectedResult);
  } catch (error) {
    throw new LlmInvocationError(error instanceof Error ? error.message : "llm_unknown_error");
  }
}
