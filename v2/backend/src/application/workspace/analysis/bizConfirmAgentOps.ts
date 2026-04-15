/**
 * bizConfirmAgentOps — Business Confirmation Agent（分片增强版）
 *
 * 保持独立：业务视角与技术分析分离，避免技术术语污染业务输出。
 * 输入：Phase 2 的 projectDetection + prioritizedFindings 作为上下文 + 原始 excerpt
 *
 * 分片策略：excerpt 超过 chunkBudget 时分片，每片独立产出，确定性合并。
 */

import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import type { AttachmentAnalysisReport, IterationAgentPrompt, VisionPayload } from '../../../domain/workspace/types';
import { parseBusinessConfirmationCandidate, listBusinessConfirmationMissingReasons } from './businessConfirmationOps';
import { type BizConfirmationChunkResult, mergeBizConfirmationChunks } from './chunkMergeOps';
import { planChunks, batchArray } from './chunkingOps';
import { type ChunkConfig, runAnalysisPrompt } from './configOps';
import { formatSourceType, formatVersionDiff, formatDiffLocations, formatBoundaries } from './extractors';

export type BizConfirmParams = {
  iterationName: string;
  baselineIterationName: string;
  analyzedTarget: string;
  sourceType: "single-file" | "folder";
  excerpt: string;
  requirements: string[];
  components: string[];
  codePaths: string[];
  clarificationQuestions: string[];
  versionDiff: { added: string[]; changed: string[]; removed: string[] };
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
  // Phase 2 上下文（新增）
  projectDetection?: AttachmentAnalysisReport["projectDetection"];
  visionPayloads?: VisionPayload[];
};

export async function runBizConfirmAgent(
  agentRunner: AgentRunner | null,
  params: BizConfirmParams,
  chunkConfig: ChunkConfig
): Promise<BizConfirmationChunkResult> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured.");
  }

  const imageDataUrls = (params.visionPayloads || []).map((v) => v.dataUrl).filter(Boolean);
  const isCompact = params.sourceType === "single-file";

  const plan = planChunks(
    params.excerpt,
    `分析对象：${params.analyzedTarget}；来源类型：${params.sourceType === "single-file" ? "单文件" : "文件夹"}`,
    chunkConfig.chunkBudget,
    chunkConfig.chunkOverlap
  );

  if (plan.chunkCount <= 1) {
    return runBizConfirmSingleChunk(agentRunner, params, params.excerpt, undefined, imageDataUrls, isCompact, chunkConfig);
  }

  // 多片并发
  const results: BizConfirmationChunkResult[] = [];
  const batches = batchArray(plan.chunks, chunkConfig.chunkParallelism);

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map((chunk) =>
        runBizConfirmSingleChunk(
          agentRunner, params, chunk.text,
          { index: chunk.index, total: chunk.total, fileRange: chunk.fileRange, digest: plan.digest },
          imageDataUrls, isCompact, chunkConfig
        )
      )
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        const log = (await import("../../../infrastructure/runtime/logger")).createLogger("biz-confirm");
        log.warn("biz confirmation chunk failed", { error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
      }
    }
  }

  if (results.length === 0) {
    throw new (await import('../shared/agentRunner')).LlmInvocationError("all biz confirmation chunks failed");
  }

  return mergeBizConfirmationChunks(results);
}

async function runBizConfirmSingleChunk(
  agentRunner: AgentRunner,
  params: BizConfirmParams,
  excerpt: string,
  chunkInfo: { index: number; total: number; fileRange: string; digest: string } | undefined,
  imageDataUrls: string[],
  isCompact: boolean,
  chunkConfig: ChunkConfig
): Promise<BizConfirmationChunkResult> {
  const chunkLabel = chunkInfo ? `chunk-${chunkInfo.index + 1}-of-${chunkInfo.total}` : "single";

  const chunkPreamble = chunkInfo ? [
    `你正在分析一份大型文档的第 ${chunkInfo.index + 1}/${chunkInfo.total} 部分。`,
    `整体概要：${chunkInfo.digest}`,
    `本片段覆盖：${chunkInfo.fileRange}`,
    "基于本片段产出业务确认内容。信息不足的字段输出空值即可。",
    ""
  ] : [];

  // 注入 Phase 2 上下文
  const phase2Context = params.projectDetection ? [
    `项目识别：${params.projectDetection.projectName || params.projectDetection.productName || "未识别"}(${params.projectDetection.projectCategory || "未分类"})`,
    `关键发现：${params.prioritizedFindings.slice(0, 5).map((f) => `${f.priority}:${f.content}`).join("；") || "无"}`
  ] : [];

  const prompt: IterationAgentPrompt = {
    agentId: `agent-biz-confirm-${chunkLabel}`,
    role: isCompact ? "requirements-analyst" : "orchestrator",
    scope: "attachment",
    goal: "输出可让业务角色直接确认的边界与版本差异说明",
    expectedOutput: "JSON: {coreIntent, successCriteria[], interactionInsights, necessityAssessment, evidenceRefs[], boundarySummary, functionalPoints[], confirmationChecklist[], versionDiffSummary, diffNarratives[], diffConfirmationOrder[]}",
    systemPrompt: "你是资深产品负责人。你必须只输出严格 JSON（不要用 ```json 包裹），所有key必须英文，禁止解释性前后文。内容必须让非技术业务人员可直接理解并确认。impactLevel 只能是 高/中/低。所有 string 类型字段的值必须使用中文业务语言，禁止出现：文件名和路径、文件大小、英文技术缩写、前端后端框架名称。如需引用具体文件作为证据，仅在 evidenceRefs 字段中使用。",
    userPrompt: [
      ...chunkPreamble,
      ...phase2Context,
      `所属迭代：${params.iterationName}`,
      `基线迭代：${params.baselineIterationName || "无基线"}`,
      `分析目标：${params.analyzedTarget}`,
      `来源类型：${formatSourceType(params.sourceType)}`,
      formatBoundaries(params.requirements, params.components, params.codePaths),
      `澄清问题：${params.clarificationQuestions.join("；") || "无"}`,
      formatVersionDiff(params.versionDiff),
      formatDiffLocations(params.diffLocations),
      `附件文本节选：${excerpt.slice(0, isCompact ? 1800 : 2800) || "无"}`,
      "输出要求：",
      "0) coreIntent: 一句话说明核心任务与业务目标",
      isCompact ? "0.1) successCriteria: 3-5条" : "0.1) successCriteria: 3-8条",
      "0.2) interactionInsights: primaryFlow/keyInteractions/exceptionPaths/usabilityRisks",
      "0.3) necessityAssessment: mustDo/shouldDo/canDefer/outOfScope/rationale",
      isCompact ? "0.4) evidenceRefs: 2-6条" : "0.4) evidenceRefs: 3-12条",
      "1) boundarySummary: 业务可读边界总结",
      isCompact ? "2) functionalPoints: 4-8条" : "2) functionalPoints: 5-12条",
      isCompact ? "3) confirmationChecklist: 3-6条(order/impactLevel/item/rationale)" : "3) confirmationChecklist: 4-10条",
      "4) versionDiffSummary: 对比上版本的业务影响摘要",
      isCompact ? "5) diffNarratives: 3-6条" : "5) diffNarratives: 4-12条",
      isCompact ? "6) diffConfirmationOrder: 2-5条" : "6) diffConfirmationOrder: 3-10条"
    ].join("\n\n")
  };

  let selected = await runAnalysisPrompt(agentRunner, prompt, { imageDataUrls });
  let candidate = parseBusinessConfirmationCandidate(selected.content);
  let missing = listBusinessConfirmationMissingReasons(candidate);

  const repairLimit = isCompact ? 1 : chunkConfig.chunkRepairAttempts;
  for (let attempt = 1; attempt <= repairLimit && missing.length > 0; attempt++) {
    const repairPrompt: IterationAgentPrompt = {
      ...prompt,
      agentId: `agent-biz-confirm-repair-${chunkLabel}-${attempt}`,
      userPrompt: [
        prompt.userPrompt,
        "你上一版输出不满足必填字段，请仅输出严格 JSON 并补齐缺失项。",
        "输出的 JSON 字符串值必须使用中文业务语言，禁止引用 JSON key 名称。",
        `缺失项：${missing.join("; ")}`,
        `上一版：${selected.content.slice(0, 2400)}`
      ].join("\n\n")
    };
    selected = await runAnalysisPrompt(agentRunner, repairPrompt, { imageDataUrls });
    candidate = parseBusinessConfirmationCandidate(selected.content);
    missing = listBusinessConfirmationMissingReasons(candidate);
  }

  if (missing.length > 0) {
    const log = (await import("../../../infrastructure/runtime/logger")).createLogger("biz-confirm");
    log.warn("biz confirmation incomplete", { chunk: chunkLabel, missing: missing.join(", ") });
  }

  return candidate;
}
