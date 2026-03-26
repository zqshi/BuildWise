import type { IterationAgentPrompt } from "../workspace/types";

export type AgentRunResult = {
  content: string;
  model?: string;
  finishReason?: string;
  truncated?: boolean;
};

export type AgentRunOptions = {
  imageDataUrls?: string[];
  modelOverride?: string;
  sessionContext?: {
    projectId?: number;
    iterationId?: number;
    conversationId?: string;
    agentId?: string;
  };
};

export type ConversationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface AgentRunner {
  run(prompt: IterationAgentPrompt, options?: AgentRunOptions): Promise<AgentRunResult>;
  runWithHistory(systemPrompt: string, messages: ConversationMessage[], options?: AgentRunOptions): Promise<AgentRunResult>;
}

/**
 * Extended capability: runners that support Gateway-style operations (probe, session persistence).
 * Use this interface for capability detection instead of instanceof checks against concrete classes.
 */
export interface GatewayCapableRunner extends AgentRunner {
  probe(): Promise<{ reachable: boolean; error: string }>;
}

export function isGatewayCapableRunner(runner: AgentRunner): runner is GatewayCapableRunner {
  return typeof (runner as GatewayCapableRunner).probe === "function";
}

export type LlmRuntimeStatus = {
  configured: boolean;
  reachable: boolean;
  baseUrl: string;
  model: string;
  checkedAt: string;
  error: string;
};

export class LlmUnavailableError extends Error {
  readonly code = "llm_unavailable";

  constructor(message = "LLM runner is unavailable") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export class LlmInvocationError extends Error {
  readonly code = "llm_invocation_failed";

  constructor(message = "LLM invocation failed") {
    super(message);
    this.name = "LlmInvocationError";
  }
}
