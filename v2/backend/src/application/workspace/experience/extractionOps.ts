import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import type { Iteration, IterationMessage } from '../../../domain/workspace/types';
import type { IterationArtifactStage } from '../../../domain/workspace/iterationTypes';
import type { IterationAgentPrompt } from '../../../domain/workspace/analysisTypes';
import type { ExperienceTriggerEvent, ExperienceExtractionRule } from '../../../domain/workspace/experiencePolicyTypes';
import type { CreateKnowledgeEntryInput, KnowledgeEntry, KnowledgeCategory } from '../../../domain/workspace/knowledgeTypes';
import { getEffectiveExperiencePolicy, getTriggerRule } from './experiencePolicyOps';
import { createLogger } from '../../../infrastructure/runtime/logger';

const log = createLogger("experience-extraction");

type ExtractedExperience = {
  title: string;
  category: KnowledgeCategory;
  content: string;
  applicableScene: string;
  tags: string[];
  confidence: number;
  scope: "project" | "cross-project";
};

function buildExtractionPrompt(
  context: string,
  triggerEvent: ExperienceTriggerEvent,
  categories: KnowledgeCategory[]
): IterationAgentPrompt {
  const categoryLabels: Record<KnowledgeCategory, string> = {
    technical: "技术经验",
    "business-rule": "业务规则",
    pitfall: "踩坑教训",
    "architecture-decision": "架构决策",
    "customer-experience": "客户体验"
  };
  const categoryHint = categories.map((c) => categoryLabels[c] || c).join("、");

  return {
    agentId: "experience-extractor",
    role: "solution-architect",
    scope: "iteration",
    goal: "从项目过程数据中提取可复用的经验条目",
    systemPrompt: `你是一位经验沉淀专家。你的任务是从项目过程数据中提取有价值的、可复用的经验条目。

提取规则：
1. 每条经验必须是具体的、可操作的，不是泛泛而谈
2. 经验分类限定为：${categoryHint}
3. 每条经验需要标注适用场景和标签
4. 评估每条经验的置信度（0-100），表示该经验的可靠程度
5. 评估每条经验的适用范围：project（仅本项目适用）或 cross-project（跨项目通用）
6. 与已有知识去重，不要提取已经存在的经验
7. 最多提取 5 条高价值经验，宁缺毋滥

输出必须是严格 JSON 数组：
[{
  "title": "经验标题（简洁明确）",
  "category": "分类key",
  "content": "经验详细描述",
  "applicableScene": "适用场景描述",
  "tags": ["标签1", "标签2"],
  "confidence": 80,
  "scope": "cross-project"
}]

只输出 JSON 数组，不要包含任何额外文字。如果没有值得提取的经验，输出空数组 []。`,
    userPrompt: `触发事件：${triggerEvent}\n\n${context}`,
    expectedOutput: "json"
  };
}

function parseExtractionResult(content: string): ExtractedExperience[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const validCategories = new Set(["technical", "business-rule", "pitfall", "architecture-decision", "customer-experience"]);
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        title: String(item.title || "").slice(0, 200),
        category: validCategories.has(String(item.category)) ? String(item.category) as KnowledgeCategory : "technical",
        content: String(item.content || ""),
        applicableScene: String(item.applicableScene || ""),
        tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 10) : [],
        confidence: Math.min(100, Math.max(0, Number(item.confidence) || 50)),
        scope: item.scope === "cross-project" ? "cross-project" as const : "project" as const
      }))
      .filter((item) => item.title && item.content);
  } catch {
    return [];
  }
}

function isDuplicate(existing: KnowledgeEntry[], candidate: ExtractedExperience): boolean {
  return existing.some((e) =>
    e.title === candidate.title ||
    (e.content.length > 20 && candidate.content.length > 20 && e.content.slice(0, 100) === candidate.content.slice(0, 100))
  );
}

function collectArtifactContext(iteration: Iteration, stage: IterationArtifactStage): string {
  const items = iteration.changeControl?.artifactWorkflow?.items ?? [];
  const stageItems = items.filter((item) => item.stage === stage && item.status === "ready");
  if (stageItems.length === 0) return "";
  return stageItems
    .map((item) => `【${item.title}】\n${item.draft?.content?.slice(0, 1500) || item.summary || "（无内容）"}`)
    .join("\n\n---\n\n");
}

function collectIterationSummary(iteration: Iteration): string {
  const sections: string[] = [];
  sections.push(`迭代名称：${iteration.name}`);
  sections.push(`版本：${iteration.version}`);
  sections.push(`目标：${(iteration.goals || []).join("、") || "未设定"}`);
  if (iteration.scope) {
    sections.push(`范围内：${iteration.scope.inScope.join("、") || "无"}`);
    sections.push(`验收标准：${iteration.scope.acceptanceCriteria.join("、") || "无"}`);
  }
  const cc = iteration.changeControl;
  if (cc) {
    if (cc.lastReportQualitySummary) sections.push(`质量摘要：${cc.lastReportQualitySummary}`);
    if (cc.lastReleaseReviewReason) sections.push(`发布评审：${cc.lastReleaseReviewReason}`);
    const findings = cc.lastMeaningfulFindings ?? [];
    if (findings.length > 0) sections.push(`关键发现：${findings.slice(0, 5).join("；")}`);
  }
  return sections.join("\n");
}

async function runExtraction(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner,
  projectId: number,
  iterationId: number | null,
  triggerEvent: ExperienceTriggerEvent,
  rule: ExperienceExtractionRule,
  contextText: string,
  sourceStage: string
): Promise<number[]> {
  if (!contextText.trim()) {
    repo.appendExperienceExtraction({
      projectId, iterationId, triggerEvent, sourceStage,
      sourceDigest: "", extractedEntryIds: [],
      status: "skipped", errorMessage: "无可提取内容", createdAt: new Date().toISOString()
    });
    return [];
  }

  const existingEntries = repo.listKnowledgeEntries(projectId);
  const existingContext = existingEntries.length > 0
    ? `\n\n已有知识条目标题（用于去重）：\n${existingEntries.map((e) => `- ${e.title}`).join("\n")}`
    : "";

  const prompt = buildExtractionPrompt(
    contextText + existingContext,
    triggerEvent,
    rule.extractCategories
  );

  try {
    const result = await agentRunner.run(prompt);
    const extracted = parseExtractionResult(result.content);
    const filtered = extracted
      .filter((item) => item.confidence >= rule.minConfidence)
      .filter((item) => !isDuplicate(existingEntries, item));

    const entryIds: number[] = [];
    for (const exp of filtered) {
      const input: CreateKnowledgeEntryInput = {
        title: exp.title,
        content: exp.content,
        category: exp.category,
        applicableScene: exp.applicableScene,
        tags: exp.tags,
        source: "auto-extraction",
        sourceRef: `${triggerEvent}:${sourceStage}`,
        iterationId
      };
      const entry = repo.createKnowledgeEntry(projectId, input, "system");
      if (entry) {
        repo.updateKnowledgeEntry({
          ...entry,
          status: rule.autoPublish ? "published" : "draft",
          experienceScope: exp.scope,
          confidence: exp.confidence
        });
        entryIds.push(entry.id);
      }
    }

    const digest = contextText.slice(0, 64);
    repo.appendExperienceExtraction({
      projectId, iterationId, triggerEvent, sourceStage, sourceDigest: digest,
      extractedEntryIds: entryIds,
      status: "success", errorMessage: "", createdAt: new Date().toISOString()
    });

    log.info(`提取完成: project=${projectId} event=${triggerEvent} 新增${entryIds.length}条经验`);
    return entryIds;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`提取失败: project=${projectId} event=${triggerEvent} error=${message}`);
    repo.appendExperienceExtraction({
      projectId, iterationId, triggerEvent, sourceStage,
      sourceDigest: "", extractedEntryIds: [],
      status: "failed", errorMessage: message, createdAt: new Date().toISOString()
    });
    return [];
  }
}

export async function maybeExtractExperience(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  event: ExperienceTriggerEvent,
  context: { projectId: number; iterationId?: number; iteration?: Iteration; stage?: IterationArtifactStage; messages?: IterationMessage[] }
): Promise<number[]> {
  if (!agentRunner) return [];

  const policy = getEffectiveExperiencePolicy(repo, context.projectId);
  const rule = getTriggerRule(policy, event);
  if (!rule) return [];

  let contextText = "";
  let sourceStage = "";
  const iteration = context.iteration ?? (context.iterationId ? repo.findIteration(context.iterationId) : null);

  switch (event) {
    case "stage-gate-passed": {
      if (!iteration || !context.stage) return [];
      sourceStage = context.stage;
      contextText = collectArtifactContext(iteration, context.stage);
      break;
    }
    case "iteration-completed": {
      if (!iteration) return [];
      sourceStage = "archive";
      contextText = collectIterationSummary(iteration);
      const allStages: IterationArtifactStage[] = ["clarification", "scope", "interaction", "development", "testing", "release"];
      for (const s of allStages) {
        const sc = collectArtifactContext(iteration, s);
        if (sc) contextText += `\n\n--- ${s}阶段交付物 ---\n${sc}`;
      }
      break;
    }
    case "analysis-report-ready": {
      if (!iteration) return [];
      sourceStage = "clarification";
      const cc = iteration.changeControl;
      if (cc) {
        contextText = [
          cc.lastReportQualitySummary ? `质量摘要：${cc.lastReportQualitySummary}` : "",
          (cc.lastMeaningfulFindings ?? []).length > 0 ? `关键发现：${cc.lastMeaningfulFindings!.join("；")}` : "",
          (cc.lastPrioritizedFindings ?? []).length > 0 ? `优先级发现：${cc.lastPrioritizedFindings!.join("；")}` : ""
        ].filter(Boolean).join("\n");
      }
      break;
    }
    case "coach-session-ended": {
      if (!iteration) return [];
      sourceStage = iteration.changeControl?.artifactWorkflow?.activeStage || "clarification";
      const msgs = context.messages ?? repo.listMessages(iteration.id, { limit: 20 });
      contextText = msgs
        .filter((m) => m.role === "assistant" || m.role === "user")
        .slice(-10)
        .map((m) => `[${m.role}] ${m.content.slice(0, 500)}`)
        .join("\n\n");
      break;
    }
    case "change-approved":
    case "release-published": {
      if (!iteration) return [];
      sourceStage = event === "release-published" ? "release" : "scope";
      contextText = collectIterationSummary(iteration);
      break;
    }
  }

  return runExtraction(repo, agentRunner, context.projectId, context.iterationId ?? iteration?.id ?? null, event, rule, contextText, sourceStage);
}
