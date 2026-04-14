import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentScope } from '../../../domain/workspace/types';

export type AgentPromptTemplate = {
  systemPrompt: string;
  userPrompt: string;
};

export type AgentWorkflowTemplate = {
  name: string;
  contextHint: string;
};

const AGENT_ASSET_ROOT = resolve(process.cwd(), "agents");
const LEGACY_PROMPT_ROOT = resolve(process.cwd(), "prompts");

function parsePromptTemplate(content: string): AgentPromptTemplate | null {
  const systemMarker = "# system";
  const userMarker = "# user";
  const lower = content.toLowerCase();
  const systemStart = lower.indexOf(systemMarker);
  const userStart = lower.indexOf(userMarker);
  if (systemStart === -1 || userStart === -1 || userStart <= systemStart) {
    return null;
  }
  const systemPrompt = content.slice(systemStart + systemMarker.length, userStart).trim();
  const userPrompt = content.slice(userStart + userMarker.length).trim();
  if (!systemPrompt || !userPrompt) {
    return null;
  }
  return { systemPrompt, userPrompt };
}

export function loadAgentPromptTemplate(roleKey: string, fallback: AgentPromptTemplate): AgentPromptTemplate {
  const normalized = roleKey.trim().toLowerCase();
  const candidates = [
    resolve(AGENT_ASSET_ROOT, "prompts", `agent.${normalized}.v2.md`),
    resolve(LEGACY_PROMPT_ROOT, `agent.${normalized}.v2.md`)
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const parsed = parsePromptTemplate(readFileSync(filePath, "utf-8"));
      if (parsed) {
        return parsed;
      }
    } catch (err) {
      console.warn("[AgentAssetRegistry] failed to load prompt template from", filePath, err);
    }
  }
  return fallback;
}

export function loadWorkflowTemplate(params: {
  scope: AgentScope;
  fallback: AgentWorkflowTemplate;
}): AgentWorkflowTemplate {
  const { scope, fallback } = params;
  const candidates = [
    resolve(AGENT_ASSET_ROOT, "workflows", "fixed", `${scope}.json`),
    resolve(AGENT_ASSET_ROOT, "workflows", "fixed", `default.json`)
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallback.name;
      const contextHint = typeof raw.contextHint === "string" ? raw.contextHint.trim() : "";
      return { name, contextHint: contextHint || fallback.contextHint };
    } catch (err) {
      console.warn("[AgentAssetRegistry] failed to load workflow template from", filePath, err);
    }
  }
  return fallback;
}
