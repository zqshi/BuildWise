/**
 * Agent Continuation Engine
 *
 * Detects LLM output truncation (via finish_reason) and automatically
 * issues continuation requests to assemble complete content.
 */

import type { AgentRunner, AgentRunResult, AgentRunOptions, ConversationMessage } from "./agentRunner";
import type { IterationAgentPrompt } from "../../domain/workspace/types";
import { createLogger } from "../shared/logger";

const log = createLogger("continuation");

export type ContinuationConfig = {
  maxContinuations: number;
  minChunkLength: number;
};

export type ContinuationResult = {
  content: string;
  continuations: number;
  complete: boolean;
  model?: string;
  finishReason?: string;
};

const DEFAULT_CONFIG: ContinuationConfig = {
  maxContinuations: 3,
  minChunkLength: 50
};

/**
 * Find the overlap between the tail of `existing` and the head of `chunk`.
 * Returns the de-duplicated merged result.
 */
function mergeChunks(existing: string, chunk: string): string {
  const tailLen = Math.min(200, existing.length);
  const tail = existing.slice(-tailLen);
  let bestOverlap = 0;
  for (let i = 1; i <= tail.length; i++) {
    if (chunk.startsWith(tail.slice(-i))) {
      bestOverlap = i;
    }
  }
  return bestOverlap > 0
    ? existing + chunk.slice(bestOverlap)
    : `${existing}\n${chunk}`;
}

/**
 * Run with automatic continuation on truncation.
 *
 * Uses `runner.run()` for the initial call, then `runner.runWithHistory()`
 * for continuation rounds with the accumulated content as context.
 */
export async function runWithContinuation(
  runner: AgentRunner,
  prompt: IterationAgentPrompt,
  options?: AgentRunOptions,
  config?: Partial<ContinuationConfig>
): Promise<ContinuationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const initial = await runner.run(prompt, options);
  if (!initial.truncated) {
    return {
      content: initial.content,
      continuations: 0,
      complete: true,
      model: initial.model,
      finishReason: initial.finishReason
    };
  }

  log.info("truncation-detected", { model: initial.model, finishReason: initial.finishReason });

  let accumulated = initial.content;
  let lastResult: AgentRunResult = initial;

  for (let i = 0; i < cfg.maxContinuations; i++) {
    const continuationMessages: ConversationMessage[] = [
      { role: "user", content: prompt.userPrompt },
      { role: "assistant", content: accumulated },
      {
        role: "user",
        content: `你的上一段输出被截断了，请从断点处继续输出后续内容，不要重复已输出的部分。上一段末尾为：\n\n…${accumulated.slice(-300)}`
      }
    ];

    const chunk = await runner.runWithHistory(prompt.systemPrompt, continuationMessages, options);
    lastResult = chunk;

    if (!chunk.content || chunk.content.length < cfg.minChunkLength) {
      log.info("continuation-short-chunk", { round: i + 1, chunkLen: chunk.content?.length ?? 0 });
      break;
    }

    accumulated = mergeChunks(accumulated, chunk.content);
    log.info("continuation-merged", { round: i + 1, totalLen: accumulated.length, truncated: chunk.truncated });

    if (!chunk.truncated) {
      return {
        content: accumulated,
        continuations: i + 1,
        complete: true,
        model: initial.model,
        finishReason: chunk.finishReason
      };
    }
  }

  return {
    content: accumulated,
    continuations: cfg.maxContinuations,
    complete: !lastResult.truncated,
    model: initial.model,
    finishReason: lastResult.finishReason
  };
}
