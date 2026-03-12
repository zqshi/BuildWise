import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentScope, IterationAgentPlan } from "../../domain/workspace/types";

export type AgentPromptTemplate = {
  systemPrompt: string;
  userPrompt: string;
};

export type AgentWorkflowTemplate = {
  name: string;
  strategy: IterationAgentPlan["strategy"];
  executionLoop: string[];
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
    } catch {
      // continue with fallback candidates
    }
  }
  return fallback;
}

type RawWorkflowTemplate = {
  name?: unknown;
  strategy?: unknown;
  executionLoop?: unknown;
  contextHint?: unknown;
};

function toWorkflowTemplate(raw: RawWorkflowTemplate, fallback: AgentWorkflowTemplate): AgentWorkflowTemplate {
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallback.name;
  const strategy = raw.strategy === "single-agent" ? "single-agent" : fallback.strategy;
  const executionLoop = Array.isArray(raw.executionLoop)
    ? raw.executionLoop.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 12)
    : [];
  const contextHint = typeof raw.contextHint === "string" ? raw.contextHint.trim() : "";
  return {
    name,
    strategy,
    executionLoop: executionLoop.length > 0 ? executionLoop : fallback.executionLoop,
    contextHint: contextHint || fallback.contextHint
  };
}

export function loadWorkflowTemplate(params: {
  scope: AgentScope;
  strategy: IterationAgentPlan["strategy"];
  fallback: AgentWorkflowTemplate;
}): AgentWorkflowTemplate {
  const { scope, strategy, fallback } = params;
  const candidates = [
    resolve(AGENT_ASSET_ROOT, "workflows", "fixed", `${scope}.${strategy}.json`),
    resolve(AGENT_ASSET_ROOT, "workflows", "fixed", `${scope}.json`),
    resolve(AGENT_ASSET_ROOT, "workflows", "fixed", `default.${strategy}.json`)
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf-8")) as RawWorkflowTemplate;
      return toWorkflowTemplate(raw, fallback);
    } catch {
      // continue with next candidate
    }
  }
  return fallback;
}

export function loadDynamicWorkflowHint(scope: AgentScope): string {
  const candidates = [
    resolve(AGENT_ASSET_ROOT, "workflows", "dynamic", `${scope}.md`),
    resolve(AGENT_ASSET_ROOT, "workflows", "dynamic", "common.md")
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }
    try {
      const content = readFileSync(filePath, "utf-8").trim();
      if (content) {
        return content;
      }
    } catch {
      // keep trying
    }
  }
  return "";
}

export function loadAgentScopeAdapterHint(): string {
  const configPath = resolve(AGENT_ASSET_ROOT, "adapters", "agent-scope.json");
  if (!existsSync(configPath)) {
    return "";
  }
  try {
    const data = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    if (data.enabled !== true) {
      return "";
    }
    const provider = typeof data.provider === "string" ? data.provider.trim() : "agent-scope";
    const capability = Array.isArray(data.capabilities)
      ? data.capabilities.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 8).join("|")
      : "";
    return `AgentScope适配已启用(provider=${provider};capabilities=${capability || "default"})`;
  } catch {
    return "";
  }
}
