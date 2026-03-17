import type { IterationMessage } from "../domain/workspace/types";
import { buildArtifactSummary, extractArtifactDisplayContent, extractDeliverableTitleFromContent, isStructuredArtifactContent } from "./artifactContentPresentation.ts";

export type ArtifactReferenceMessage = {
  title: string;
  summary: string;
  evidence: string[];
  prompt: string;
};

export type IterationChatDisplayItem = {
  key: string;
  leadMessage: IterationMessage;
  textMessage: IterationMessage | null;
  cardMessage: IterationMessage | null;
};

const IMPACT_ASSESSMENT_SIGNAL = /(影响评估|影响范围|受影响交付物|受影响页面|受影响模块|边界风险|代码边界|组件映射|需求映射)/;
const IMPACT_CONFIRMATION_SIGNAL = /(请确认|待确认|请补充|确认或补充|需要我确认|关键边界)/;
function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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

export function buildIterationChatDisplayItems(messages: IterationMessage[]) {
  const items: IterationChatDisplayItem[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const current = messages[index];
    const next = messages[index + 1];
    const currentCard = current.role === "assistant" || current.role === "system" ? parseArtifactReferenceMessage(current.content) : null;
    const nextCard = next && (next.role === "assistant" || next.role === "system") ? parseArtifactReferenceMessage(next.content) : null;
    const currentUserEcho = current.role === "user" ? parseArtifactReferenceMessage(current.content) : null;

    if (currentUserEcho) {
      continue;
    }

    if (current.role === "assistant" && !currentCard && next?.role === "assistant" && nextCard) {
      items.push({
        key: `${current.id}-${next.id}`,
        leadMessage: current,
        textMessage: current,
        cardMessage: next
      });
      index += 1;
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

export function hasAssistantImpactAssessment(messages: IterationMessage[]) {
  return messages.some((message) => {
    if (message.role !== "assistant") {
      return false;
    }
    if (parseArtifactReferenceMessage(message.content)) {
      return false;
    }
    const content = message.content.replace(/\s+/g, " ").trim();
    return IMPACT_ASSESSMENT_SIGNAL.test(content) && IMPACT_CONFIRMATION_SIGNAL.test(content);
  });
}
