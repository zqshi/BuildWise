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
  const latestMessage = [...repo.listMessages(iterationId)].pop();
  if (
    latestMessage &&
    (latestMessage.role === "assistant" || latestMessage.role === "system") &&
    latestMessage.content === content
  ) {
    return latestMessage;
  }
  return repo.createMessage(iterationId, "assistant", content);
}
