/**
 * Coach 响应清洗 —— LLM 输出后处理：抽取控制标记、剥离内部工具调用残留、字段名替换为业务语言。
 * 纯字符串处理，无副作用、无 IO。
 */

import { safeJsonParse } from '../upload/attachmentUtils';

// ── Coach marker extraction (shared with CoachOps) ──

const COACH_MARKER_PATTERNS = [
  /<!--\s*coach:\s*(\{[\s\S]*?\})\s*-->/i,
  /<!--\s*coach:\s*(\{[\s\S]*?\})\s*$/i
];

function extractCoachMarkerFromText(text: string): { json: string; fullMatch: string } | null {
  for (const pattern of COACH_MARKER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { json: match[1] ?? "", fullMatch: match[0] };
    }
  }
  return null;
}

export function extractCoachMarker(rawContent: string): { reply: string; marker: Record<string, unknown> | null } {
  const extracted = extractCoachMarkerFromText(rawContent);
  if (extracted) {
    const reply = rawContent.replace(extracted.fullMatch, "").trim();
    return { reply, marker: safeJsonParse(extracted.json) };
  }
  const parsed = safeJsonParse(rawContent);
  if (parsed && typeof parsed.reply === "string") {
    return { reply: parsed.reply, marker: parsed };
  }
  return { reply: rawContent.trim(), marker: null };
}

export function stripInternalToolCalls(reply: string) {
  let text = reply;
  text = text.replace(/<minimax_tool_call>[\s\S]*?<\/minimax_tool_call>/gi, "");
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  text = text.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "");
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  // 替换 LLM 泄漏的内部字段名为业务语言
  text = text.replace(/\binScope\b/g, "本轮范围");
  text = text.replace(/\boutOfScope\b/g, "明确不做");
  // 清理已知的内部 kebab-case 标识符（白名单模式，避免误删合法英文词如 e-commerce、end-to-end）
  const INTERNAL_IDENTIFIERS = [
    "advance-phase", "boundary-confirmation", "confirm-boundary",
    "run-full-cycle", "enter-clarify-mode", "confirm-accurate",
    "confirm-inaccurate", "capture-business-rule", "collect-attachment",
    "stage-transition", "gate-check", "artifact-commit", "artifact-confirm",
    "coach-reply", "policy-gate", "agent-selected"
  ];
  for (const id of INTERNAL_IDENTIFIERS) {
    text = text.replaceAll(id, "");
  }
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\[skills\]/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function pickStringList(value: unknown, max = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}
