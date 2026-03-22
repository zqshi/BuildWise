export type OpenclawStructuredMessage = {
  status: string;
  summary: string;
  questions: string[];
  nextActions: string[];
  risks: string[];
  evidence: string[];
  artifacts: string[];
  flowRoute: string;
};

export type OpenclawPresentedMessage =
  | { kind: "plain"; text: string }
  | { kind: "structured"; data: OpenclawStructuredMessage };

function toTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  try {
    const direct = JSON.parse(text) as unknown;
    return direct && typeof direct === "object" && !Array.isArray(direct) ? (direct as Record<string, unknown>) : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return null;
    }
    try {
      const sliced = JSON.parse(text.slice(start, end + 1)) as unknown;
      return sliced && typeof sliced === "object" && !Array.isArray(sliced) ? (sliced as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

function extractStructured(raw: string): OpenclawStructuredMessage | null {
  const parsed = tryParseJsonObject(raw);
  if (!parsed) {
    return null;
  }
  const status = typeof parsed.status === "string" ? parsed.status.trim() : "";
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const questions = toTextArray(parsed.questions);
  const nextActions = toTextArray(parsed.next_actions ?? parsed.nextActions);
  const risks = toTextArray(parsed.risks);
  const evidence = toTextArray(parsed.evidence);
  const artifacts = toTextArray(parsed.artifacts);
  const flowRoute = typeof parsed.flow_route === "string" ? parsed.flow_route.trim() : typeof parsed.flowRoute === "string" ? parsed.flowRoute.trim() : "";
  const hasContractShape =
    Boolean(status || summary) ||
    questions.length > 0 ||
    nextActions.length > 0 ||
    risks.length > 0 ||
    evidence.length > 0 ||
    artifacts.length > 0 ||
    Boolean(flowRoute);
  if (!hasContractShape) {
    return null;
  }
  return {
    status: status || "unknown",
    summary: summary || "未提供摘要。",
    questions,
    nextActions,
    risks,
    evidence,
    artifacts,
    flowRoute
  };
}

/**
 * Strip internal LLM markers that should never be shown to users.
 * Defence-in-depth: backend also sanitizes, but we guard the display layer too.
 */
function stripInternalMarkers(raw: string): string {
  let text = raw;
  // minimax:tool_call (colon) and minimax_tool_call (underscore)
  text = text.replace(/<minimax[_:]tool_call>[\s\S]*?<\/minimax[_:]tool_call>/gi, "");
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  text = text.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "");
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  text = text.replace(/<\/?(?:search|function_call|tool_use|result)[^>]*>/gi, "");
  text = text.replace(/^\[skills\].*$/gim, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function presentOpenclawMessage(raw: string): OpenclawPresentedMessage {
  const text = stripInternalMarkers(raw);
  if (!text) {
    return { kind: "plain", text: "" };
  }
  const structured = extractStructured(text);
  if (structured) {
    return { kind: "structured", data: structured };
  }
  return { kind: "plain", text };
}
