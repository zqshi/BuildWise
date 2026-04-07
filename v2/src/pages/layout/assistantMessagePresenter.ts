/**
 * Assistant message presenter — parses assistant responses into display-ready structures.
 */

type StructuredMessageData = {
  status: string;
  summary: string;
  questions: string[];
  nextActions: string[];
  risks: string[];
  evidence: string[];
  flowRoute: string;
};

type PlainMessage = { kind: "plain"; text: string };
type StructuredMessage = { kind: "structured"; data: StructuredMessageData };
type PresentedMessage = PlainMessage | StructuredMessage;

export function presentAssistantMessage(raw: string): PresentedMessage {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "status" in parsed) {
      return {
        kind: "structured",
        data: {
          status: parsed.status ?? "",
          summary: parsed.summary ?? "",
          questions: Array.isArray(parsed.questions) ? parsed.questions : [],
          nextActions: Array.isArray(parsed.next_actions) ? parsed.next_actions : [],
          risks: Array.isArray(parsed.risks) ? parsed.risks : [],
          evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
          flowRoute: parsed.flow_route ?? "",
        }
      };
    }
  } catch {
    // not JSON — treat as plain text
  }
  return { kind: "plain", text: raw };
}
