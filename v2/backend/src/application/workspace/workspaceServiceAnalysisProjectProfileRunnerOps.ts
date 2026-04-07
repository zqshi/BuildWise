import { LlmInvocationError, LlmUnavailableError, type AgentRunOptions, type AgentRunResult, type AgentRunner } from "./agentRunner";
import type { AttachmentAnalysisReport, IterationAgentOutput, IterationAgentPrompt, VisionPayload } from "../../domain/workspace/types";
import { isLowSignalText, parseJsonObjectFromText, pickStringList } from "./workspaceAnalysisExtractors";
import {
  listProjectProfileMissingReasons,
  parsePrioritizedFindingsFromText,
  parseProjectDetectionFromText,
  parseProjectProfileCandidate
} from "./workspaceServiceAnalysisProjectProfileOps";
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
    .map((item) => `${item.role}:${item.status}\n${(item.content || "").slice(0, compactOutputLength)}`)
    .join("\n\n---\n\n");
  const synthesisRole: "requirements-analyst" | "orchestrator" = isCompactPrimaryContext
    ? "requirements-analyst"
    : "orchestrator";
  const prompt = {
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
      "priority 只允许 P0/P1/P2。输出必须具体、可证据化，禁止空泛话术。"
    ].join("\n"),
    userPrompt: [
      `分析目标=${params.analyzedTarget};sourceType=${params.sourceType};iteration=${params.iterationName};context=${params.contextLabel || "primary"}`,
      `文件统计=total:${params.fileStats.totalFiles},text:${params.fileStats.textFiles},binary:${params.fileStats.binaryFiles}`,
      `版本差异=added:${params.versionDiff.added.join(" | ") || "-"};changed:${params.versionDiff.changed.join(" | ") || "-"};removed:${
        params.versionDiff.removed.join(" | ") || "-"
      }`,
      `附件节选:\n${params.excerpt.slice(0, isCompactPrimaryContext ? 1600 : 2500) || "无"}`,
      isCompactPrimaryContext ? "" : `多Agent输出:\n${compactOutputs || "无"}`,
      isCompactPrimaryContext
        ? "请输出：1)projectDetection(projectName/productName/projectCategory/evidence<=3条) 2)meaningfulFindings(2-4条，必须具体且可验证) 3)prioritizedFindings(<=4条，每条含priority/content/reason) 4)nextActions(<=3条)。所有key必须英文。"
        : "请输出：1)projectDetection(projectName/productName/projectCategory/evidence<=4条) 2)meaningfulFindings(2-8条，必须具体且可验证) 3)prioritizedFindings(<=8条，每条含priority/content/reason) 4)nextActions(<=6条)。所有key必须英文。"
    ].join("\n\n")
  };
  try {
    const imageDataUrls = (params.visionPayloads || []).map((item) => item.dataUrl).filter(Boolean);
    const modelCandidates = Array.from(new Set(["", ...deps.synthesisLlmConfig.fallbackModels]));
    let llmAttemptCount = 0;
    const runSynthesisPrompt = async (nextPrompt: IterationAgentPrompt) => {
      llmAttemptCount += 1;
      const modelRaw = modelCandidates[(llmAttemptCount - 1) % modelCandidates.length] || "";
      const modelOverride = modelRaw.trim() || undefined;
      return deps.runAnalysisPrompt(agentRunner, nextPrompt, { imageDataUrls, modelOverride });
    };
    let selectedResult = await runSynthesisPrompt(prompt);
    let candidate = parseProjectProfileCandidate(selectedResult.content);
    let missingReasons = listProjectProfileMissingReasons(candidate);

    const maxRepairAttempts =
      params.sourceType === "single-file" && params.fileStats.totalFiles <= 1
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
          "1) projectDetection.projectName 或 projectDetection.productName 至少一个非空",
          "2) meaningfulFindings 至少 2 条（string数组），且每条需明确证据或可验证动作",
          "3) prioritizedFindings 至少 1 条（对象数组，每个含英文key: priority/content/reason），priority 仅允许 P0/P1/P2",
          "4) nextActions 至少 1 条（string数组）",
          'schema示例: {"projectDetection":{"projectName":"X","productName":"Y","projectCategory":"Z","evidence":["..."]},"meaningfulFindings":["..."],"prioritizedFindings":[{"priority":"P0","content":"...","reason":"..."}],"nextActions":["..."]}',
          `本次缺失项：${missingReasons.join("; ")}`,
          `上一版输出：\n${selectedResult.content.slice(0, 2400)}`
        ].join("\n\n")
      };
      selectedResult = await runSynthesisPrompt(repairPrompt);
      candidate = parseProjectProfileCandidate(selectedResult.content);
      missingReasons = listProjectProfileMissingReasons(candidate);
    }

    if (!isSupplementalContext && !isCompactPrimaryContext && candidate.prioritizedFindings.length === 0 && candidate.meaningfulFindings.length > 0) {
      const prioritizePrompt = {
        agentId: "agent-report-prioritize-1",
        role: "orchestrator" as const,
        scope: "attachment" as const,
        goal: "基于关键发现输出优先级发现",
        expectedOutput: "JSON: {prioritizedFindings:[{priority,content,reason}]}",
        systemPrompt:
          '你是资深技术负责人。你必须只输出严格 JSON（不要用 ```json 包裹），不得输出解释文字。所有key必须英文。schema: {"prioritizedFindings":[{"priority":"P0","content":"...","reason":"..."}]}。priority 只能是 P0/P1/P2。',
        userPrompt: [
          `分析目标=${params.analyzedTarget};iteration=${params.iterationName}`,
          `关键发现:\n${candidate.meaningfulFindings.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
          "请输出 prioritizedFindings（1-8条），每条包含 priority/content/reason。"
        ].join("\n\n")
      };
      const prioritizedResult = await runSynthesisPrompt(prioritizePrompt);
      const prioritizedFromModel = parsePrioritizedFindingsFromText(prioritizedResult.content);
      if (prioritizedFromModel.length > 0) {
        candidate = { ...candidate, prioritizedFindings: prioritizedFromModel };
      }
    }

    for (
      let attempt = 1;
      !isSupplementalContext && !isCompactPrimaryContext && attempt <= deps.synthesisLlmConfig.findingsRepairAttempts && candidate.meaningfulFindings.length === 0;
      attempt += 1
    ) {
      const findingsPrompt = {
        agentId: `agent-report-findings-${attempt}`,
        role: "orchestrator" as const,
        scope: "attachment" as const,
        goal: "基于上下文补齐关键发现",
        expectedOutput: "JSON: {meaningfulFindings:[...]}",
        systemPrompt:
          '你是资深产品分析师。你必须只输出严格 JSON（不要用 ```json 包裹），不得输出解释文字。所有key必须英文。schema: {"meaningfulFindings":["具体发现1","具体发现2"]}。meaningfulFindings 必须具体、可验证、避免空泛。',
        userPrompt: [
          `分析目标=${params.analyzedTarget};iteration=${params.iterationName};sourceType=${params.sourceType};attempt=${attempt}`,
          `附件节选:\n${params.excerpt.slice(0, 2600) || "无"}`,
          `优先级发现:\n${
            candidate.prioritizedFindings.map((item, index) => `${index + 1}. ${item.priority} ${item.content}（${item.reason || "无原因"}）`).join("\n") ||
            "无"
          }`,
          `上一版输出片段:\n${selectedResult.content.slice(0, 1800) || "无"}`,
          "请输出 meaningfulFindings（2-8条），每条需具备可验证证据、影响对象、建议动作三个要素。"
        ].join("\n\n")
      };
      const findingsResult = await runSynthesisPrompt(findingsPrompt);
      const findingsParsed = parseJsonObjectFromText(findingsResult.content);
      const meaningfulFindingsFromModel = pickStringList(findingsParsed?.meaningfulFindings, 8);
      if (meaningfulFindingsFromModel.length > 0) {
        candidate = { ...candidate, meaningfulFindings: meaningfulFindingsFromModel };
        break;
      }
    }

    for (
      let attempt = 1;
      !isSupplementalContext &&
      !isCompactPrimaryContext &&
      attempt <= deps.synthesisLlmConfig.projectDetectionRepairAttempts &&
      !candidate.projectName &&
      !candidate.productName;
      attempt += 1
    ) {
      const detectionPrompt = {
        agentId: `agent-report-project-detection-${attempt}`,
        role: "orchestrator" as const,
        scope: "attachment" as const,
        goal: "补齐项目与产品识别",
        expectedOutput: "JSON: {projectDetection:{projectName,productName,projectCategory,evidence[]}}",
        systemPrompt:
          '你是资深产品分析师。你必须只输出严格 JSON（不要用 ```json 包裹），不得输出解释文字。所有key必须英文。schema: {"projectDetection":{"projectName":"...","productName":"...","projectCategory":"...","evidence":["..."]}}。projectName 或 productName 至少一个非空。',
        userPrompt: [
          `分析目标=${params.analyzedTarget};iteration=${params.iterationName};sourceType=${params.sourceType};attempt=${attempt}`,
          `附件节选:\n${params.excerpt.slice(0, 2600) || "无"}`,
          `版本差异=added:${params.versionDiff.added.join(" | ") || "-"};changed:${params.versionDiff.changed.join(" | ") || "-"};removed:${
            params.versionDiff.removed.join(" | ") || "-"
          }`,
          `上一版输出片段:\n${selectedResult.content.slice(0, 2000) || "无"}`,
          "请仅输出 projectDetection，要求 evidence 1-4 条，且 projectName/productName 至少一个非空。"
        ].join("\n\n")
      };
      const detectionResult = await runSynthesisPrompt(detectionPrompt);
      const detectionCandidate = parseProjectDetectionFromText(detectionResult.content);
      const detectedProjectName = detectionCandidate.projectName;
      const detectedProductName = detectionCandidate.productName;
      const detectedProjectCategory = detectionCandidate.projectCategory;
      const detectedEvidence = detectionCandidate.evidence;
      if (detectedProjectName || detectedProductName) {
        candidate = {
          ...candidate,
          projectName: detectedProjectName || candidate.projectName,
          productName: detectedProductName || candidate.productName,
          projectCategory: detectedProjectCategory || candidate.projectCategory,
          evidence: detectedEvidence.length > 0 ? detectedEvidence : candidate.evidence
        };
      }
    }

    // Only hard-fail on the most fundamental check; everything else is best-effort
    if (!isSupplementalContext && !candidate.projectName && !candidate.productName) {
      throw new LlmInvocationError("LLM synthesis returned invalid payload: missing projectDetection.projectName/productName");
    }
    {
      const warnings: string[] = [];
      if (candidate.meaningfulFindings.length === 0) warnings.push("meaningfulFindings is empty");
      if (candidate.prioritizedFindings.length === 0) warnings.push("prioritizedFindings is empty");
      if (candidate.nextActions.length === 0) warnings.push("nextActions is empty");
      if (candidate.meaningfulFindings.every(isLowSignalText)) warnings.push("low-signal meaningfulFindings");
      if (candidate.nextActions.every(isLowSignalText)) warnings.push("low-signal nextActions");
      if (warnings.length > 0) {
        const log = (await import("../shared/logger")).createLogger("proj-profile");
        log.warn("project profile partially incomplete", { warnings: warnings.join(", ") });
      }
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
  } catch (error) {
    throw new LlmInvocationError(error instanceof Error ? error.message : "llm_unknown_error");
  }
}
