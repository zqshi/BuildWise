import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { API_BASE, API_PREFIX } from "../shared/apiConfig";

export type AssistantMessage = {
  id: number;
  tenantId: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AssistantChatResponse = {
  reply: string;
  messages: AssistantMessage[];
};

export async function sendAssistantMessage(message: string) {
  return fetchJSON<AssistantChatResponse>(`${API_BASE}${API_PREFIX}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  }, 60000);
}

export async function fetchAssistantMessages(limit = 50) {
  return fetchJSON<AssistantMessage[]>(`${API_BASE}${API_PREFIX}/assistant/messages?limit=${limit}`);
}

export async function clearAssistantMessages() {
  return fetchJSON<{ ok: boolean }>(`${API_BASE}${API_PREFIX}/assistant/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
}
