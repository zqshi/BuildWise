import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { MSG_PREFIX } from "../../domain/workspace/constants";

type ArtifactConversationItem = {
  title: string;
  summary: string;
  evidence: string[];
};

type PublishArtifactReferenceInput = ArtifactConversationItem & {
  prompt: string;
  /** 交付物实际生成内容（draft.content），用于内容质量门禁 */
  draftContent?: string;
};

function buildArtifactReferenceMessage(item: PublishArtifactReferenceInput) {
  const evidence = item.evidence.map((entry) => entry.trim()).filter(Boolean);
  const summary = item.summary.trim();
  return [
    `${MSG_PREFIX.ARTIFACT_REFERENCE}${item.title}`,
    summary ? `摘要：${summary}` : "",
    evidence.length > 0 ? `关注点：${evidence.slice(0, 3).join("；")}` : "",
    item.prompt.trim()
  ]
    .filter(Boolean)
    .join("\n");
}

export function publishArtifactReferenceMessage(
  repo: WorkspaceRepository,
  iterationId: number,
  item: PublishArtifactReferenceInput
) {
  // ── 统一内容质量门禁 ──
  // 交付物卡片必须有实质内容才能发布，拒绝空壳
  const draft = (item.draftContent ?? "").trim();
  // 核心规则：draft 必须有真实内容（>= 30 字），光靠 summary 状态描述不算生成交付物
  const hasRealContent = draft.length >= 30;
  if (!hasRealContent) {
    return null;
  }

  const content = buildArtifactReferenceMessage(item);
  const messages = repo.listMessages(iterationId);
  // Deduplicate: skip if there's already a reference for the same artifact title
  // within the last 20 messages (avoid flooding chat with repeated artifact cards)
  const recentMessages = messages.slice(-20);
  const titlePrefix = `\u3010\u4ea4\u4ed8\u7269\u5f15\u7528\u3011${item.title}`;
  const existingRef = recentMessages.find(
    (msg) =>
      (msg.role === "assistant" || msg.role === "system") &&
      (msg.content === content || msg.content.startsWith(titlePrefix))
  );
  if (existingRef) {
    return existingRef;
  }
  return repo.createMessage(iterationId, "assistant", content);
}

/**
 * 发布变更影响警示条消息到对话流。
 * 格式：【变更影响】{title1}·{title2}·...｜已自动标记待同步
 * 去重：最近 10 条消息内不重复发相同内容。
 */
export function publishChangeImpactMessage(
  repo: WorkspaceRepository,
  iterationId: number,
  staleItems: Array<{ title: string }>
) {
  if (staleItems.length === 0) return null;
  const itemNames = staleItems.map((i) => i.title).join("·");
  const content = `${MSG_PREFIX.CHANGE_IMPACT}${itemNames}｜已自动标记待同步`;

  const messages = repo.listMessages(iterationId);
  const recentMessages = messages.slice(-10);
  const duplicate = recentMessages.find(
    (msg) => msg.role === "system" && msg.content === content
  );
  if (duplicate) return duplicate;

  return repo.createMessage(iterationId, "system", content);
}
