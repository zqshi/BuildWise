import type { WorkspaceRepository } from "../../domain/workspace/repository";

type ArtifactConversationItem = {
  title: string;
  summary: string;
  evidence: string[];
};

type PublishArtifactReferenceInput = ArtifactConversationItem & {
  prompt: string;
};

function buildArtifactReferenceMessage(item: PublishArtifactReferenceInput) {
  const evidence = item.evidence.map((entry) => entry.trim()).filter(Boolean);
  const summary = item.summary.trim();
  return [
    `【交付物引用】${item.title}`,
    `摘要：${summary || "请打开交付物查看详情。"}`,
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
  const content = buildArtifactReferenceMessage(item);
  const prefix = `【交付物引用】${item.title}`;
  const messages = repo.listMessages(iterationId);
  // Deduplicate: skip if there's already a reference for the same artifact title
  // within the last 20 messages (avoid flooding chat with repeated artifact cards)
  const recentMessages = messages.slice(-20);
  const existingRef = recentMessages.find(
    (msg) =>
      (msg.role === "assistant" || msg.role === "system") &&
      msg.content.startsWith(prefix)
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
  const content = `【变更影响】${itemNames}｜已自动标记待同步`;

  const messages = repo.listMessages(iterationId);
  const recentMessages = messages.slice(-10);
  const duplicate = recentMessages.find(
    (msg) => msg.role === "system" && msg.content === content
  );
  if (duplicate) return duplicate;

  return repo.createMessage(iterationId, "system", content);
}
