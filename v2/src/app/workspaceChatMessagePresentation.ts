import type { IterationMessage } from "../domain/workspace/types";
import { buildArtifactSummary, extractArtifactDisplayContent, extractDeliverableTitleFromContent, isStructuredArtifactContent } from "./artifactContentPresentation.ts";

export type ArtifactReferenceMessage = {
  title: string;
  summary: string;
  evidence: string[];
  prompt: string;
  gateStatus?: "pending" | "passed" | "blocked";
};

export type IterationChatDisplayItem = {
  key: string;
  leadMessage: IterationMessage;
  textMessage: IterationMessage | null;
  cardMessage: IterationMessage | null;
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildArtifactReferenceSignature(message: ArtifactReferenceMessage) {
  return JSON.stringify({
    title: normalizeText(message.title),
    summary: normalizeText(message.summary),
    evidence: message.evidence.map((entry) => normalizeText(entry))
  });
}

export function hasEquivalentArtifactReferenceMessage(leftContent: string, rightContent: string) {
  const left = parseArtifactReferenceMessage(leftContent);
  const right = parseArtifactReferenceMessage(rightContent);
  if (!left || !right) {
    return false;
  }
  return buildArtifactReferenceSignature(left) === buildArtifactReferenceSignature(right);
}

export function compactArtifactCardSummary(summary: string, fallback = "") {
  return buildArtifactSummary(summary, fallback, 3);
}

export function shouldSuppressArtifactTextMessage(text: string, cardSummary: string, deliverableTitle = "") {
  const normalizedText = normalizeText(extractArtifactDisplayContent(text));
  if (!normalizedText) {
    return true;
  }
  const normalizedSummary = normalizeText(cardSummary);
  if (normalizedSummary && (normalizedText === normalizedSummary || normalizedText.includes(normalizedSummary))) {
    return true;
  }
  if ((deliverableTitle || extractDeliverableTitleFromContent(text)) && isStructuredArtifactContent(text)) {
    return true;
  }
  if (isStructuredArtifactContent(text) && /查看交付物|打开交付物|请确认|待确认/.test(normalizedText)) {
    return true;
  }
  return false;
}

export function parseArtifactReferenceMessage(content: string): ArtifactReferenceMessage | null {
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
  const title = lines[0].replace(/^【交付物引用】/, "").trim() || "交付物";
  const findValue = (prefix: string) => {
    const line = lines.find((item) => item.startsWith(prefix));
    return line ? line.replace(prefix, "").trim() : "";
  };
  const summary = findValue("摘要：");
  const evidenceRaw = findValue("关注点：") || findValue("证据：");
  const prompt =
    lines.find((item) => item.startsWith("请基于") || item.startsWith("请围绕") || item.startsWith("请查看")) ||
    `请基于「${title}」继续推进下一阶段。`;
  const evidence = evidenceRaw
    ? evidenceRaw
        .split(/[；;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  return { title, summary: compactArtifactCardSummary(summary), evidence, prompt };
}

export function normalizeUserChatInput(content: string) {
  const trimmed = content.trim();
  const parsed = parseArtifactReferenceMessage(trimmed);
  if (!parsed) {
    return trimmed;
  }
  if (/^请围绕交付物/.test(parsed.prompt)) {
    return parsed.prompt
      .replace(/继续与用户确认/g, "继续与我确认")
      .replace(/，?不要直接跨阶段推进。?$/g, "。")
      .trim();
  }
  if (/^请基于该交付物/.test(parsed.prompt)) {
    return parsed.prompt.replace(/^请基于该交付物/, `请基于交付物「${parsed.title}」`).trim();
  }
  return `请基于交付物「${parsed.title}」继续与我确认需要调整的内容。`;
}

function isVisibleSystemMessage(msg: IterationMessage): boolean {
  // 非 system 消息总是可见
  if (msg.role !== "system") return true;
  // system 消息只有以下情况才显示：
  // 1. 变更影响警示条（以【变更影响】开头）
  // 2. 上传事件（包含 upload 标记或以"已上传"开头）
  // 3. 错误/失败消息（以"附件分析失败"、"分析失败"、"任务执行超时"等开头）
  // 其他 system 消息（如"已启动 X 个交付物"等内部状态）不显示
  if (msg.content.startsWith("【变更影响】")) return true;
  if (msg.content.includes("<!-- upload:") || msg.content.includes("<!-- upload-b64:") || /^已上传(附件|文档|原型|文件夹)/.test(msg.content)) return true;
  if (/^(附件分析失败|分析失败|任务执行超时|执行失败)/.test(msg.content)) return true;
  return false;
}

export function buildIterationChatDisplayItems(messages: IterationMessage[]) {
  const items: IterationChatDisplayItem[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const current = messages[index];
    if (!isVisibleSystemMessage(current)) continue;
    const next = messages[index + 1];
    const currentCard = current.role === "assistant" || current.role === "system" ? parseArtifactReferenceMessage(current.content) : null;
    const nextCard = next && (next.role === "assistant" || next.role === "system") ? parseArtifactReferenceMessage(next.content) : null;
    const currentUserEcho = current.role === "user" ? parseArtifactReferenceMessage(current.content) : null;

    if (currentUserEcho) {
      continue;
    }

    if (current.role === "assistant" && !currentCard && next?.role === "assistant" && nextCard) {
      let lastCardIndex = index + 1;
      while (
        messages[lastCardIndex + 1]?.role === "assistant" &&
        hasEquivalentArtifactReferenceMessage(messages[lastCardIndex]?.content, messages[lastCardIndex + 1]?.content)
      ) {
        lastCardIndex += 1;
      }
      items.push({
        key: `${current.id}-${messages[lastCardIndex]?.id}`,
        leadMessage: current,
        textMessage: current,
        cardMessage: messages[lastCardIndex]!
      });
      index = lastCardIndex;
      continue;
    }

    if (
      currentCard &&
      next?.role === "assistant" &&
      hasEquivalentArtifactReferenceMessage(current.content, next.content)
    ) {
      continue;
    }

    items.push({
      key: String(current.id),
      leadMessage: current,
      textMessage: currentCard ? null : current,
      cardMessage: currentCard ? current : null
    });
  }
  return items;
}

export type ChangeImpactMessage = {
  items: string[];
  note: string;
};

export function parseChangeImpactMessage(content: string): ChangeImpactMessage | null {
  if (!content.startsWith("【变更影响】")) return null;
  const body = content.replace(/^【变更影响】/, "");
  const parts = body.split("｜");
  const itemsStr = (parts[0] || "").trim();
  const note = (parts[1] || "已自动标记待同步").trim();
  const items = itemsStr.split("·").map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return null;
  return { items, note };
}

type MessageLike = { role: string; content: string };

export function hasAssistantImpactAssessment(messages: MessageLike[]): boolean {
  return messages.some(
    (msg) =>
      msg.role === "assistant" &&
      /影响评估/.test(msg.content) &&
      /请确认/.test(msg.content)
  );
}
