/**
 * conversationRequirementExtractor.ts
 *
 * 职责：从对话历史中提取结构化需求信息，回写 changeControl。
 *
 * 触发时机：Agent 声明了 artifact 但 synthesize 合成不出有效内容时，
 * 由 StageOrchestrator 调用。不在每次 Coach 对话时自动触发。
 *
 * 幂等：已有值的字段不覆盖（来自文档分析的优先级更高）。
 */

import type { AgentRunner } from '../shared/agentRunner';
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { runWithContinuation } from '../shared/agentContinuation';
import { normalizeIterationMessageContent, sanitizeForCoachContext } from './messageSanitizer';
import { normalizeIteration } from '../shared/workspaceSupport';
import { defaultIterationChangeControl } from '../shared/common';
import { ensureArtifactWorkflow } from '../changeControl/artifactWorkflow';
import { safeJsonParse } from '../upload/attachmentUtils';
import { nowIso } from '../../../shared/utils';

// ── Prompt ──

const EXTRACTION_SYSTEM_PROMPT = `你是一位需求分析师。你的任务是从用户与教练的对话历史中，提取结构化的需求信息。

输出要求：
- 严格输出一个 JSON 对象，不要包含任何 markdown 代码块标记或其他文本
- 只提取对话中明确提到的信息，不要推测或补充
- 如果某个字段无法从对话中提取，保持空字符串或空数组`;

function buildExtractionUserPrompt(conversationText: string): string {
  return `以下是用户与教练的对话历史：

${conversationText}

请从上述对话中提取结构化需求信息，输出以下 JSON 格式：

{
  "coreIntent": "用户的核心意图（一句话概括）",
  "boundarySummary": "变更范围边界概述",
  "functionalPoints": ["功能要点1", "功能要点2"],
  "successCriteria": ["成功标准1", "成功标准2"],
  "confirmationChecklist": ["待确认事项1", "待确认事项2"],
  "necessityAssessment": {
    "mustDo": ["必须做的事项"],
    "shouldDo": ["应该做的事项"],
    "canDefer": ["可以延后的事项"],
    "outOfScope": ["明确不做的事项"],
    "rationale": "评估依据"
  },
  "interactionInsights": {
    "primaryFlow": ["主要交互流程步骤"],
    "keyInteractions": ["关键交互要素"],
    "exceptionPaths": ["异常路径描述"],
    "usabilityRisks": ["可用性风险"]
  },
  "versionDiffSummary": "与上版本的差异摘要（如果对话中提及）",
  "diffNarratives": ["业务化差异描述1", "业务化差异描述2"],
  "meaningfulFindings": ["关键发现1", "关键发现2"],
  "clarificationQuestions": ["待澄清问题1", "待澄清问题2"]
}`;
}

// ── Extraction ──

function buildConversationText(repo: WorkspaceRepository, iterationId: number): string {
  const messages = repo
    .listMessages(iterationId)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12);

  if (messages.length === 0) return "";

  return messages
    .map((m) => {
      const role = m.role === "user" ? "用户" : "教练";
      const content = sanitizeForCoachContext(
        normalizeIterationMessageContent(m.role, m.content).slice(0, 600).replace(/\s+/g, " ")
      );
      return `${role}：${content}`;
    })
    .join("\n\n");
}

function mergeStringIfEmpty(existing: string, extracted: string): string {
  return existing.trim() ? existing : extracted.trim();
}

function mergeArrayIfEmpty(existing: string[], extracted: string[]): string[] {
  return existing.length > 0 ? existing : extracted.filter(Boolean);
}

function parseExtractionResult(content: string) {
  const raw = content.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = safeJsonParse(raw) as Record<string, unknown> | null;
  if (!parsed) return null;
  const pickStrArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : [];
  return {
    coreIntent: typeof parsed.coreIntent === "string" ? parsed.coreIntent : "",
    boundarySummary: typeof parsed.boundarySummary === "string" ? parsed.boundarySummary : "",
    functionalPoints: pickStrArr(parsed.functionalPoints),
    successCriteria: pickStrArr(parsed.successCriteria),
    confirmationChecklist: pickStrArr(parsed.confirmationChecklist),
    necessityAssessment: parsed.necessityAssessment as Record<string, unknown> | undefined,
    interactionInsights: parsed.interactionInsights as Record<string, unknown> | undefined,
    versionDiffSummary: typeof parsed.versionDiffSummary === "string" ? parsed.versionDiffSummary : "",
    diffNarratives: pickStrArr(parsed.diffNarratives),
    meaningfulFindings: pickStrArr(parsed.meaningfulFindings),
    clarificationQuestions: pickStrArr(parsed.clarificationQuestions)
  };
}

function mergeExtractedIntoChangeControl(
  cc: ReturnType<typeof defaultIterationChangeControl>,
  p: NonNullable<ReturnType<typeof parseExtractionResult>>
) {
  const bc = cc.lastBusinessConfirmation;
  const na = p.necessityAssessment ?? {};
  const ii = p.interactionInsights ?? {};
  const pickStrArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : [];
  const merged = {
    ...bc,
    coreIntent: mergeStringIfEmpty(bc.coreIntent, p.coreIntent),
    boundarySummary: mergeStringIfEmpty(bc.boundarySummary, p.boundarySummary),
    functionalPoints: mergeArrayIfEmpty(bc.functionalPoints, p.functionalPoints),
    successCriteria: mergeArrayIfEmpty(bc.successCriteria, p.successCriteria),
    confirmationChecklist: mergeArrayIfEmpty(bc.confirmationChecklist, p.confirmationChecklist),
    necessityAssessment: bc.necessityAssessment.rationale.trim()
      ? bc.necessityAssessment
      : {
          mustDo: pickStrArr(na.mustDo), shouldDo: pickStrArr(na.shouldDo),
          canDefer: pickStrArr(na.canDefer), outOfScope: pickStrArr(na.outOfScope),
          rationale: typeof na.rationale === "string" ? na.rationale : ""
        },
    interactionInsights: {
      primaryFlow: mergeArrayIfEmpty(bc.interactionInsights?.primaryFlow ?? [], pickStrArr(ii.primaryFlow)),
      keyInteractions: mergeArrayIfEmpty(bc.interactionInsights?.keyInteractions ?? [], pickStrArr(ii.keyInteractions)),
      exceptionPaths: mergeArrayIfEmpty(bc.interactionInsights?.exceptionPaths ?? [], pickStrArr(ii.exceptionPaths)),
      usabilityRisks: mergeArrayIfEmpty(bc.interactionInsights?.usabilityRisks ?? [], pickStrArr(ii.usabilityRisks))
    },
    versionDiffSummary: mergeStringIfEmpty(bc.versionDiffSummary ?? "", p.versionDiffSummary),
    diffNarratives: mergeArrayIfEmpty(bc.diffNarratives ?? [], p.diffNarratives)
  };
  return {
    ...cc,
    lastBusinessConfirmation: merged,
    lastMeaningfulFindings: mergeArrayIfEmpty(cc.lastMeaningfulFindings, p.meaningfulFindings),
    clarificationQuestions: mergeArrayIfEmpty(cc.clarificationQuestions, p.clarificationQuestions ?? [])
  };
}

export async function extractRequirementsFromConversation(
  agentRunner: AgentRunner,
  repo: WorkspaceRepository,
  iterationId: number
): Promise<boolean> {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return false;

  const conversationText = buildConversationText(repo, iterationId);
  if (conversationText.length < 30) return false;

  const prompt = {
    agentId: "agent-conversation-extractor-1",
    role: "requirements-analyst" as const,
    scope: "iteration" as const,
    goal: "从对话历史提取结构化需求信息",
    expectedOutput: "严格 JSON",
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userPrompt: buildExtractionUserPrompt(conversationText)
  };

  let result: Awaited<ReturnType<typeof runWithContinuation>> | undefined;
  try {
    result = await runWithContinuation(agentRunner, prompt, {
      sessionContext: { projectId: iteration.projectId, iterationId }
    }, { maxContinuations: 1 });
  } catch {
    return false;
  }
  if (!result) return false;

  const p = parseExtractionResult(result.content);
  if (!p) return false;

  const normalized = normalizeIteration(iteration);
  const cc = normalized.changeControl ?? defaultIterationChangeControl();
  const now = nowIso();
  const updatedCc = { ...mergeExtractedIntoChangeControl(cc, p), lastAnalysisAt: cc.lastAnalysisAt || now };
  const workflow = ensureArtifactWorkflow(normalized, updatedCc, now);
  repo.updateIteration({ ...normalized, changeControl: { ...updatedCc, artifactWorkflow: workflow } });
  return true;
}
