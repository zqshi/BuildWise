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

export async function sendAssistantMessage(tenantId: string, message: string) {
  return fetchJSON<AssistantChatResponse>(`${API_BASE}${API_PREFIX}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, message })
  }, 60000);
}

export async function fetchAssistantMessages(tenantId: string, limit = 50) {
  return fetchJSON<AssistantMessage[]>(`${API_BASE}${API_PREFIX}/assistant/messages?tenantId=${encodeURIComponent(tenantId)}&limit=${limit}`);
}

export async function clearAssistantMessages(tenantId: string) {
  return fetchJSON<{ ok: boolean }>(`${API_BASE}${API_PREFIX}/assistant/clear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId })
  });
}
