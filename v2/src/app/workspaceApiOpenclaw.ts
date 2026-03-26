import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";
import { API_BASE, API_PREFIX } from "./workspaceApiCore";

export type OpenclawIntegrationStatusPayload = {
  runtimeConfigFound: boolean;
  openclawRoot: string;
  openclawEntry: string;
  openclawEntryExists: boolean;
  profile: string;
  agentId: string;
  openclawHome: string;
  openclawHomeWritable: boolean;
  authProfilePath: string;
  authConfigured: boolean;
  modelStatusChecked: boolean;
  modelAuthSource: string;
  integrated: boolean;
  reason: string;
};

export type OpenclawConversationPayload = {
  id: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type OpenclawGlobalMessagePayload = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function fetchOpenclawIntegrationStatus(role = "owner") {
  return fetchJSON<OpenclawIntegrationStatusPayload>(`${API_BASE}${API_PREFIX}/governance/openclaw/status`, {
    headers: { "x-role": role }
  });
}

export async function sendOpenclawProjectChat(projectId: number, message: string, role = "owner") {
  return fetchJSON<{
    mode: "openclaw-native";
    profile: string;
    agentId: string;
    workspacePath: string;
    reply: string;
    at: string;
  }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/openclaw/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify({ message })
  });
}

export async function fetchOpenclawConversations() {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/openclaw/conversations`);
  return ensureArray<OpenclawConversationPayload>(data);
}

export async function createOpenclawConversation(title?: string) {
  return fetchJSON<OpenclawConversationPayload>(`${API_BASE}${API_PREFIX}/openclaw/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
}

export async function fetchOpenclawConversationMessages(conversationId: string) {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/openclaw/conversations/${conversationId}/messages`);
  return ensureArray<OpenclawGlobalMessagePayload>(data);
}

export async function sendOpenclawConversationMessage(conversationId: string, content: string) {
  return fetchJSON<{ userMessage: OpenclawGlobalMessagePayload; assistantMessage: OpenclawGlobalMessagePayload }>(
    `${API_BASE}${API_PREFIX}/openclaw/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    },
    180000
  );
}
