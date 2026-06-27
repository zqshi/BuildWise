/**
 * LLM 调用统计与重试 —— 内存环形缓冲区记录每次 LLM 调用，供运行时探查；瞬时失败自动重试一次。
 */

import { createLogger } from "../runtime/logger";
import { resolveErrorMessage } from "../../shared/utils";

const log = createLogger("llm-run");

// ── In-memory LLM call stats ring buffer ──

export type LlmCallRecord = {
  ts: string;
  model: string;
  role: string;
  agentId: string;
  latencyMs: number;
  status: "ok" | "error" | "retry";
  error?: string;
  truncated?: boolean;
};

const LLM_STATS_MAX = 200;
const llmCallRecords: LlmCallRecord[] = [];

export function recordLlmCall(record: LlmCallRecord) {
  llmCallRecords.push(record);
  if (llmCallRecords.length > LLM_STATS_MAX) {
    llmCallRecords.splice(0, llmCallRecords.length - LLM_STATS_MAX);
  }
}

export function getLlmCallStats(limit = 50): {
  records: LlmCallRecord[];
  summary: { total: number; errors: number; retries: number; avgLatencyMs: number };
} {
  const records = llmCallRecords.slice(-limit);
  const total = llmCallRecords.length;
  const errors = llmCallRecords.filter((r) => r.status === "error").length;
  const retries = llmCallRecords.filter((r) => r.status === "retry").length;
  const latencies = llmCallRecords.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs);
  const avgLatencyMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  return { records, summary: { total, errors, retries, avgLatencyMs } };
}

/**
 * Retry a fetch-based LLM call once on transient failures (5xx, network error, timeout).
 * Uses a fixed 1.5s backoff before the retry attempt.
 */
export async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const msg = resolveErrorMessage(error);
    const isTransient =
      msg.includes("llm_http_5") ||
      msg.includes("AbortError") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("fetch failed") ||
      msg.includes("network");
    if (!isTransient) throw error;
    log.warn("llm-retry", { label, error: msg });
    recordLlmCall({ ts: new Date().toISOString(), model: "", role: label, agentId: "", latencyMs: 0, status: "retry", error: msg });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return fn();
  }
}
