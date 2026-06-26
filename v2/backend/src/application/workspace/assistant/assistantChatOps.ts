import type { WorkspaceRepository, AssistantMessage } from "../../../domain/workspace/repository";
import type { AgentRunner } from "../shared/agentRunner";
import { searchExperienceAcrossProjects, generateCrossProjectInsights } from "../experience/crossProjectOps";
import { getEffectiveExperiencePolicy, updateExperiencePolicyOp } from "../experience/experiencePolicyOps";

export type AssistantChatResponse = {
  reply: string;
  messages: AssistantMessage[];
};

type AssistantIntent =
  | { type: "search-experience"; query: string }
  | { type: "cross-project-insights" }
  | { type: "update-policy"; field: string; value: unknown }
  | { type: "view-policy" }
  | { type: "general"; question: string };

const INTENT_SYSTEM_PROMPT = `你是 BuildWise 业务助手（项目大管家），负责全局流程编排和经验治理。

你的能力范围：
1. 跨项目经验搜索 — 用户想查找某类经验、教训、最佳实践
2. 全景洞察 — 用户想了解各项目的共性风险、健康度对比、经验覆盖情况
3. 沉淀策略调整 — 用户想修改经验自动提取的触发规则、置信度阈值、扫描间隔
4. 查看当前策略 — 用户想了解当前生效的沉淀策略配置
5. 通用对话 — 不属于以上类别的其他问题

根据用户消息，判断意图并返回 JSON（不要有其他内容）：
- 搜索经验：{"type":"search-experience","query":"<搜索关键词>"}
- 全景洞察：{"type":"cross-project-insights"}
- 修改策略：{"type":"update-policy","field":"<字段名>","value":<新值>}
  field 可选值：minConfidence(数字)、autoPublish(布尔)、scheduleScanEnabled(布尔)、scheduleScanIntervalDays(数字)
- 查看策略：{"type":"view-policy"}
- 通用对话：{"type":"general","question":"<用户原始问题>"}`;

function parseIntent(raw: string): AssistantIntent {
  try {
    const trimmed = raw.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
      if (parsed.type === "search-experience" && parsed.query) return parsed;
      if (parsed.type === "cross-project-insights") return parsed;
      if (parsed.type === "update-policy" && parsed.field) return parsed;
      if (parsed.type === "view-policy") return parsed;
      if (parsed.type === "general") return parsed;
    }
  } catch { /* fall through */ }
  return { type: "general", question: raw };
}

async function runLlm(agentRunner: AgentRunner, systemPrompt: string, userPrompt: string): Promise<string> {
  const result = await agentRunner.runWithHistory(systemPrompt, [{ role: "user", content: userPrompt }]);
  return result.content;
}

export async function assistantChatOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  tenantId: string,
  userMessage: string
): Promise<AssistantChatResponse> {
  const now = new Date().toISOString();
  repo.appendAssistantMessage({ tenantId, role: "user", content: userMessage, metadata: {}, createdAt: now });

  if (!agentRunner) {
    const fallback = "抱歉，AI 服务暂时不可用，请稍后再试。";
    repo.appendAssistantMessage({ tenantId, role: "assistant", content: fallback, metadata: {}, createdAt: now });
    return { reply: fallback, messages: repo.listAssistantMessages(tenantId) };
  }

  const intent = await classifyIntent(agentRunner, userMessage);
  const reply = await executeIntent(repo, agentRunner, tenantId, intent);

  repo.appendAssistantMessage({ tenantId, role: "assistant", content: reply, metadata: { intent: intent.type }, createdAt: now });
  return { reply, messages: repo.listAssistantMessages(tenantId) };
}

async function classifyIntent(agentRunner: AgentRunner, message: string): Promise<AssistantIntent> {
  try {
    const result = await runLlm(agentRunner, INTENT_SYSTEM_PROMPT, message);
    return parseIntent(result);
  } catch {
    return { type: "general", question: message };
  }
}

async function executeIntent(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner,
  tenantId: string,
  intent: AssistantIntent
): Promise<string> {
  switch (intent.type) {
    case "search-experience":
      return handleSearchExperience(repo, agentRunner, tenantId, intent.query);
    case "cross-project-insights":
      return handleCrossProjectInsights(repo, agentRunner, tenantId);
    case "view-policy":
      return handleViewPolicy(repo);
    case "update-policy":
      return handleUpdatePolicy(repo, intent.field, intent.value);
    case "general":
      return handleGeneralChat(agentRunner, intent.question);
  }
}

async function handleSearchExperience(
  repo: WorkspaceRepository,
  _agentRunner: AgentRunner,
  tenantId: string,
  query: string
): Promise<string> {
  const results = searchExperienceAcrossProjects(repo, query, tenantId);
  if (results.length === 0) {
    return `没有找到与"${query}"相关的经验条目。可以尝试换个关键词，或者等项目积累更多经验后再搜索。`;
  }
  const items = results.slice(0, 5).map((r, i) =>
    `${i + 1}. **${r.entry.title}**（${r.projectName}）\n   ${r.entry.content.slice(0, 120)}${r.entry.content.length > 120 ? "..." : ""}\n   相关度 ${r.relevanceScore}% · ${r.matchReason}`
  );
  return `找到 ${results.length} 条相关经验，以下是最相关的：\n\n${items.join("\n\n")}`;
}

async function handleCrossProjectInsights(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner,
  tenantId: string
): Promise<string> {
  const report = await generateCrossProjectInsights(repo, agentRunner, tenantId);
  if (report.insights.length === 0) {
    return "当前暂无足够数据生成跨项目洞察。需要至少一个项目有已发布的经验条目。";
  }
  const summary = report.insights.map((insight) =>
    `**${insight.title}**\n${insight.finding}\n建议：${insight.recommendation}`
  );
  return `跨项目全景洞察（覆盖 ${report.projectCount} 个项目，${report.totalExperienceEntries} 条经验）：\n\n${summary.join("\n\n---\n\n")}`;
}

function handleViewPolicy(repo: WorkspaceRepository): string {
  const policy = getEffectiveExperiencePolicy(repo, 0);
  const enabledRules = policy.rules.filter((r) => r.enabled);
  const lines = [
    `当前生效策略（${policy.scope === "platform" ? "平台默认" : "项目级"}，v${policy.version}）：`,
    "",
    `**触发规则**（${enabledRules.length}/${policy.rules.length} 启用）：`,
    ...enabledRules.map((r) => `- ${r.trigger}：置信度 ≥ ${r.minConfidence}，${r.autoPublish ? "自动发布" : "人工审核"}`),
    "",
    `**定期扫描**：${policy.scheduleScanEnabled ? `已启用，每 ${policy.scheduleScanIntervalDays} 天` : "未启用"}`,
  ];
  return lines.join("\n");
}

function handleUpdatePolicy(repo: WorkspaceRepository, field: string, value: unknown): string {
  const policy = getEffectiveExperiencePolicy(repo, 0);

  switch (field) {
    case "minConfidence": {
      const num = Number(value);
      if (Number.isNaN(num) || num < 0 || num > 100) return "置信度阈值必须在 0-100 之间。";
      const newRules = policy.rules.map((r) => ({ ...r, minConfidence: num }));
      updateExperiencePolicyOp(repo, policy.id, { rules: newRules });
      return `已将所有规则的最低置信度阈值调整为 ${num}。`;
    }
    case "autoPublish": {
      const bool = Boolean(value);
      const newRules = policy.rules.map((r) => ({ ...r, autoPublish: bool }));
      updateExperiencePolicyOp(repo, policy.id, { rules: newRules });
      return bool ? "已开启自动发布，达到置信度阈值的经验将自动发布。" : "已关闭自动发布，提取的经验将进入草稿待人工审核。";
    }
    case "scheduleScanEnabled": {
      const enabled = Boolean(value);
      updateExperiencePolicyOp(repo, policy.id, { scheduleScanEnabled: enabled });
      return enabled ? `已启用定期扫描（每 ${policy.scheduleScanIntervalDays} 天）。` : "已关闭定期扫描。";
    }
    case "scheduleScanIntervalDays": {
      const days = Number(value);
      if (Number.isNaN(days) || days < 1 || days > 90) return "扫描间隔必须在 1-90 天之间。";
      updateExperiencePolicyOp(repo, policy.id, { scheduleScanIntervalDays: days });
      return `已将定期扫描间隔调整为每 ${days} 天。`;
    }
    default:
      return `不支持修改字段"${field}"。可调整的配置：minConfidence、autoPublish、scheduleScanEnabled、scheduleScanIntervalDays。`;
  }
}

async function handleGeneralChat(agentRunner: AgentRunner, question: string): Promise<string> {
  try {
    return await runLlm(
      agentRunner,
      "你是 BuildWise 业务助手（项目大管家）。用简洁的中文回答用户关于项目管理、经验沉淀、流程编排方面的问题。如果问题超出你的能力范围，坦诚告知。回复控制在 200 字以内。",
      question
    );
  } catch {
    return "抱歉，处理这个问题时出了点状况，请稍后再试。";
  }
}
