import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { ContinuousModelingRepository } from '../../../domain/continuousModeling/repository';
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { IterationCodeRewriteResponse } from '../../../domain/workspace/types';
import { pickString } from '../../../shared/utils';
import { buildProjectModelView, summarizeProjectModelView } from '../../continuousModeling/continuousModelingProjectView';
import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import { assertBoundaryWhitelist, resolveBoundaryFileCandidates } from '../shared/boundaryGuard';
import { safeJsonParse } from '../upload/attachmentUtils';
import { normalizeIteration, normalizeProject } from '../shared/workspaceSupport';
import { normalizeRelPath } from '../shared/common';
import type { CodingAgentAdapter } from '../../../domain/shared/codingAgent';
import type { AgentRegistry } from '../../../infrastructure/agent/agentRegistry';
import { verifyCodingAgentChanges, type ChangedFile } from './codeRewritePostVerify';
import type { BoundaryViolation, CodeRewriteEdit } from './codeRewriteJobOps';

function previewText(content: string, maxLength = 320) {
  return content.replace(/\s+/g, " ").slice(0, maxLength);
}

function isFrontendPath(path: string) {
  const lower = path.toLowerCase();
  return (
    /\.(tsx|jsx|css|scss|less)$/.test(lower) ||
    /(^|\/)(frontend|web|ui|views|pages|components|styles)(\/|$)/.test(lower)
  );
}

function isBackendPath(path: string) {
  const lower = path.toLowerCase();
  return (
    /\.(sql|prisma)$/.test(lower) ||
    /(^|\/)(backend|server|api|controllers|services|repositories|routes|migrations)(\/|$)/.test(lower)
  );
}

function filterCandidatesByRole(paths: string[], role?: "delivery-engineer" | "frontend-developer" | "backend-developer") {
  if (role === "frontend-developer") {
    return paths.filter(isFrontendPath);
  }
  if (role === "backend-developer") {
    return paths.filter(isBackendPath);
  }
  return paths;
}

type RewriteContext = {
  projectId: number;
  repoPath: string;
  boundaryCodePaths: string[];
  acceptanceCriteria: string[];
  acceptanceChecks: string[];
  candidateFiles: string[];
  fileSnippets: Array<{ path: string; preview: string }>;
  maxFiles: number;
};

function resolveRewriteContext(
  repo: WorkspaceRepository,
  iterationId: number,
  input: { maxFiles?: number; role?: "delivery-engineer" | "frontend-developer" | "backend-developer" }
): RewriteContext | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;
  const normalized = normalizeIteration(iteration);
  const project = repo.findProject(normalized.projectId);
  if (!project) return null;
  const repoPath = normalizeProject(project).repository?.workspace?.repoPath || "";
  const boundary = normalized.changeControl?.boundary;
  const boundaryCodePaths = boundary?.codePaths ?? [];
  if (!repoPath || boundaryCodePaths.length === 0) {
    throw new Error("改写边界未就绪：缺少仓库路径或代码路径白名单");
  }
  const maxFiles = Number.isInteger(input.maxFiles) && Number(input.maxFiles) > 0 ? Math.min(Number(input.maxFiles), 12) : 6;
  const allCandidates = resolveBoundaryFileCandidates({
    repoPath, whitelist: boundaryCodePaths,
    maxFiles: Math.max(maxFiles, 12),
    allowedExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss"]
  });
  const candidateFiles = filterCandidatesByRole(allCandidates, input.role).slice(0, maxFiles);
  const fileSnippets = candidateFiles.map((p) => ({
    path: p, preview: readFileSync(join(repoPath, p), "utf-8").slice(0, 1800)
  }));
  if (fileSnippets.length === 0) {
    throw new Error("改写边界未就绪：代码路径白名单内未找到可编辑文件");
  }
  return {
    projectId: normalized.projectId, repoPath, boundaryCodePaths,
    acceptanceCriteria: normalized.scope.acceptanceCriteria,
    acceptanceChecks: normalized.changeControl?.executableConstraints?.acceptanceChecks ?? [],
    candidateFiles, fileSnippets, maxFiles
  };
}

function buildRewritePrompt(
  role: string, instruction: string, ctx: RewriteContext, modelViewSummary: string
) {
  return {
    agentId: `agent-bounded-rewrite-${role}-1`,
    role: role as "delivery-engineer" | "frontend-developer" | "backend-developer",
    scope: "iteration" as const,
    goal: `按白名单路径生成增量改写结果`,
    expectedOutput: "JSON: {summary,warnings[],edits:[{path,reason,content}]}",
    systemPrompt: [
      "你是 BuildWise 增量改写器。",
      "严格遵守边界白名单 codePaths；不得输出边界外路径。",
      "你必须将验收标准作为硬约束优先满足，不能仅当备注处理。",
      modelViewSummary ? "你必须遵守以下统一模型视图中的术语和规则约束，确保改写产物与业务模型一致。" : "",
      "仅输出 JSON，不要 markdown。",
      "content 必须是目标文件完整内容（不是 diff）。",
      "如果无法安全改写，返回空 edits 并在 warnings 说明。"
    ].filter(Boolean).join("\n"),
    userPrompt: [
      `用户指令：${instruction}`,
      modelViewSummary ? `\n${modelViewSummary}` : "",
      `白名单代码路径：${ctx.boundaryCodePaths.join("；")}`,
      `验收标准：${ctx.acceptanceCriteria.join("；") || "无"}`,
      `执行验收约束：${ctx.acceptanceChecks.join("；") || "无"}`,
      `候选文件：${ctx.candidateFiles.join("；")}`,
      "文件片段：",
      ...ctx.fileSnippets.map((item) => `---\n文件：${item.path}\n${item.preview}`),
      "请基于以上信息，按边界白名单生成增量改写结果。"
    ].join("\n\n")
  };
}

function validateAndApplyRewriteEdits(
  rawEdits: unknown[], ctx: RewriteContext, dryRun: boolean
) {
  const outOfBoundaryFiles: string[] = [];
  const outOfCandidateFiles: string[] = [];
  const appliedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const edits: IterationCodeRewriteResponse["edits"] = [];
  const candidateSet = new Set(ctx.candidateFiles.map((item) => normalizeRelPath(item)));
  for (const item of rawEdits.slice(0, ctx.maxFiles)) {
    const row = item as Record<string, unknown>;
    const path = normalizeRelPath(pickString(row.path));
    const reason = pickString(row.reason) || "LLM rewrite";
    const content = pickString(row.content);
    if (!path || !content) continue;
    if (!candidateSet.has(path)) { outOfCandidateFiles.push(path); continue; }
    const boundaryCheck = assertBoundaryWhitelist({ repoPath: ctx.repoPath, whitelist: ctx.boundaryCodePaths, changedPaths: [path] });
    if (!boundaryCheck.ok) { outOfBoundaryFiles.push(path); continue; }
    const before = readFileSync(join(ctx.repoPath, path), "utf-8");
    if (before === content) { skippedFiles.push(path); continue; }
    if (!dryRun) { writeFileSync(join(ctx.repoPath, path), content, "utf-8"); appliedFiles.push(path); }
    edits.push({ path, reason, beforePreview: previewText(before), afterPreview: previewText(content) });
  }
  return { edits, appliedFiles, skippedFiles, outOfBoundaryFiles, outOfCandidateFiles };
}

export async function rewriteCodeInBoundaryOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  iterationId: number,
  input: { instruction: string; dryRun?: boolean; maxFiles?: number; role?: "delivery-engineer" | "frontend-developer" | "backend-developer" },
  modelingRepo?: ContinuousModelingRepository | null
): Promise<IterationCodeRewriteResponse | null> {
  const ctx = resolveRewriteContext(repo, iterationId, input);
  if (!ctx) return null;
  if (!agentRunner) {
    throw new LlmUnavailableError("Code rewrite LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL).");
  }
  const dryRun = input.dryRun === true;
  const role = input.role || "delivery-engineer";
  const modelViewSummary = modelingRepo
    ? summarizeProjectModelView(buildProjectModelView(repo, modelingRepo, ctx.projectId, iterationId))
    : "";
  const prompt = buildRewritePrompt(role, input.instruction.trim(), ctx, modelViewSummary);
  const llmResult = await agentRunner.run(prompt);
  const parsed = safeJsonParse(llmResult.content);
  const warnings = Array.isArray(parsed?.warnings) ? parsed.warnings.map((item: unknown) => pickString(item)).filter(Boolean).slice(0, 12) : [];
  const summary = pickString(parsed?.summary) || "已完成边界内改写建议。";
  const rawEdits = Array.isArray(parsed?.edits) ? parsed.edits : [];
  if (rawEdits.length === 0) throw new Error("改写结果为空：未生成任何编辑内容");
  const result = validateAndApplyRewriteEdits(rawEdits, ctx, dryRun);
  if (result.edits.length === 0) throw new Error("改写结果经边界校验后无有效编辑");
  return {
    iterationId, dryRun, summary,
    warnings: result.outOfCandidateFiles.length > 0
      ? [...warnings, `以下文件未在候选列表中，已忽略：${Array.from(new Set(result.outOfCandidateFiles)).slice(0, 6).join("、")}`]
      : warnings,
    appliedFiles: Array.from(new Set(result.appliedFiles)),
    skippedFiles: Array.from(new Set(result.skippedFiles)),
    outOfBoundaryFiles: Array.from(new Set(result.outOfBoundaryFiles)),
    edits: result.edits
  };
}

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
