/**
 * 编码 agent 改写路径（V2.2）—— agent 真实改代码 → git diff → 事后边界校验 → 回滚越界。
 * 纯执行器，不涉及 job 状态机（由调用方包装为异步 job）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeRelPath } from '../shared/common';
import type { CodingAgentAdapter } from '../../../domain/shared/codingAgent';
import type { AgentRegistry } from '../../../infrastructure/agent/agentRegistry';
import { verifyCodingAgentChanges, type ChangedFile } from './codeRewritePostVerify';
import type { BoundaryViolation, CodeRewriteEdit } from './codeRewriteJobOps';

// ── 编码 agent 路径（V2.2）：agent 真实改代码 → git diff → 事后边界校验 ──

export type CodeRewriteGitOps = {
  listChangedPaths(repoPath: string): Promise<string[]>;
  readFileContent(repoPath: string, path: string, baseline: "HEAD" | "working"): Promise<{ before: string; after: string }>;
  revertFile(repoPath: string, path: string): Promise<void>;
};

/** 真实 gitOps 实现：用 git status/diff/checkout 操作工作区 */
export const realCodeRewriteGitOps: CodeRewriteGitOps = {
  async listChangedPaths(repoPath) {
    const res = spawnSync("git", ["status", "--porcelain"], { cwd: repoPath, encoding: "utf-8", timeout: 20_000 });
    if (res.status !== 0) return [];
    return res.stdout.split("\n")
      .map((line) => line.slice(3).trim().replace(/ -> .+$/, ""))
      .map((p) => normalizeRelPath(p))
      .filter(Boolean);
  },
  async readFileContent(repoPath, path, baseline) {
    const abs = join(repoPath, path);
    const after = safeReadFile(abs);
    const before = baseline === "HEAD" ? safeGitShow(repoPath, path) : after;
    return { before, after };
  },
  async revertFile(repoPath, path) {
    spawnSync("git", ["checkout", "--", path], { cwd: repoPath, encoding: "utf-8", timeout: 20_000 });
  },
};

function safeReadFile(absPath: string): string {
  try { return readFileSync(absPath, "utf-8"); } catch { return ""; }
}

function safeGitShow(repoPath: string, path: string): string {
  const res = spawnSync("git", ["show", `HEAD:${path}`], { cwd: repoPath, encoding: "utf-8", timeout: 20_000 });
  return res.status === 0 ? res.stdout : "";
}

export type CodeRewriteAgentContext = {
  repoPath: string;
  boundaryCodePaths: string[];
  instruction: string;
  role?: "delivery-engineer" | "frontend-developer" | "backend-developer";
  acceptanceCriteria?: string[];
  maxFiles?: number;
};

export type CodeRewriteAgentResult = {
  edits: CodeRewriteEdit[];
  violations: BoundaryViolation[];
  events: import("../../../domain/shared/codingAgent").CodingAgentEvent[];
};

/**
 * 执行编码 agent 改写：registry.create → start → 轮询 → git diff → 事后边界校验 → 回滚越界。
 * 纯执行器，不涉及 job 状态机（由调用方包装为异步 job）。
 */
export async function executeCodeRewriteViaAgent(params: {
  registry: AgentRegistry;
  gitOps: CodeRewriteGitOps;
  context: CodeRewriteAgentContext;
  adapterType?: string;
  pollIntervalMs?: number;
  maxPollMs?: number;
}): Promise<CodeRewriteAgentResult> {
  const { registry, gitOps, context } = params;
  const adapterType = params.adapterType ?? "claude-code-cli";
  const pollIntervalMs = params.pollIntervalMs ?? 2000;
  const maxPollMs = params.maxPollMs ?? 10 * 60 * 1000;

  const adapter: CodingAgentAdapter = registry.create(adapterType);
  const { sessionId } = await adapter.start({
    repoPath: context.repoPath,
    instruction: context.instruction,
    boundaryCodePaths: context.boundaryCodePaths,
    role: context.role,
    acceptanceCriteria: context.acceptanceCriteria,
    maxFiles: context.maxFiles,
  });

  const finalStatus = await pollUntilSettled(adapter, sessionId, pollIntervalMs, maxPollMs);
  const events = await adapter.getEvents(sessionId);
  if (finalStatus.status === "failed") {
    throw new Error(finalStatus.error || "coding agent failed");
  }
  if (finalStatus.status === "cancelled") {
    throw new Error("coding agent cancelled");
  }

  const changedPaths = await gitOps.listChangedPaths(context.repoPath);
  const changedFiles: ChangedFile[] = [];
  for (const path of changedPaths) {
    const { before, after } = await gitOps.readFileContent(context.repoPath, path, "HEAD");
    changedFiles.push({ path, beforeContent: before, afterContent: after });
  }

  const verifyResult = verifyCodingAgentChanges({
    whitelist: context.boundaryCodePaths,
    repoPath: context.repoPath,
    changedFiles,
  });

  for (const path of verifyResult.violationPaths) {
    await gitOps.revertFile(context.repoPath, path);
  }

  await adapter.close();
  return { edits: verifyResult.edits, violations: verifyResult.violations, events };
}

async function pollUntilSettled(
  adapter: CodingAgentAdapter,
  sessionId: string,
  intervalMs: number,
  maxMs: number
): Promise<{ status: string; error?: string }> {
  const start = Date.now();
  for (;;) {
    const status = await adapter.getStatus(sessionId);
    if (status.status !== "running") {
      return status;
    }
    if (Date.now() - start > maxMs) {
      await adapter.cancel(sessionId);
      return { status: "timeout", error: "agent execution timeout" };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
