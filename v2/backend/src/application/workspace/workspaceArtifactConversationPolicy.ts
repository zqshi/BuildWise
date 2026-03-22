import type { WorkspaceRepository } from "../../domain/workspace/repository";

type ArtifactConversationItem = {
  title: string;
  summary: string;
  evidence: string[];
};

type PublishArtifactReferenceInput = ArtifactConversationItem & {
  prompt: string;
};

type ParsedArtifactReference = ArtifactConversationItem | null;

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseArtifactReferenceMessage(content: string): ParsedArtifactReference {
  if (!content.startsWith("【交付物引用】")) {
    return null;
  }
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  const title = lines[0]?.replace(/^【交付物引用】/, "").trim() || "交付物";
  const summaryLine = lines.find((line) => line.startsWith("摘要：")) || "";
  const evidenceLine = lines.find((line) => line.startsWith("关注点：") || line.startsWith("证据：")) || "";
  const evidenceRaw = evidenceLine.replace(/^(关注点：|证据：)/, "").trim();
  return {
    title,
    summary: summaryLine.replace(/^摘要：/, "").trim(),
    evidence: evidenceRaw
      ? evidenceRaw
          .split(/[；;]+/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []
  };
}

function buildArtifactSignature(item: ArtifactConversationItem) {
  return JSON.stringify({
    title: normalizeText(item.title),
    summary: normalizeText(item.summary),
    evidence: item.evidence.map((entry) => normalizeText(entry))
  });
}

export function buildArtifactReferenceMessage(item: PublishArtifactReferenceInput) {
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

export function hasEquivalentArtifactReferenceMessage(leftContent: string, rightContent: string) {
  const left = parseArtifactReferenceMessage(leftContent);
  const right = parseArtifactReferenceMessage(rightContent);
  if (!left || !right) {
    return false;
  }
  return buildArtifactSignature(left) === buildArtifactSignature(right);
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
