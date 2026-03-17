import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { IterationCodeRewriteResponse } from "../../domain/workspace/types";
import { LlmUnavailableError, type AgentRunner } from "./agentRunner";
import { assertBoundaryWhitelist, resolveBoundaryFileCandidates } from "./boundaryGuard";
import { safeJsonParse } from "./workspaceServiceAttachmentUtils";
import { normalizeIteration, normalizeProject } from "./workspaceSupport";
import { normalizeRelPath } from "../../interfaces/http/routes/workspaceRouteUtils";

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

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

export async function rewriteCodeInBoundaryOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  iterationId: number,
  input: { instruction: string; dryRun?: boolean; maxFiles?: number; role?: "delivery-engineer" | "frontend-developer" | "backend-developer" }
): Promise<IterationCodeRewriteResponse | null> {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalizedIteration = normalizeIteration(iteration);
  const project = repo.findProject(normalizedIteration.projectId);
  if (!project) {
    return null;
  }
  const normalizedProject = normalizeProject(project);
  const repoPath = normalizedProject.repository?.workspace?.repoPath || "";
  const boundary = normalizedIteration.changeControl?.boundary;
  const boundaryCodePaths = boundary?.codePaths ?? [];
  const acceptanceCriteria = normalizedIteration.scope.acceptanceCriteria;
  const acceptanceChecks = normalizedIteration.changeControl?.executableConstraints?.acceptanceChecks ?? [];
  if (!repoPath || boundaryCodePaths.length === 0) {
    throw new Error("rewrite boundary is not ready: missing repository path or boundary codePaths");
  }
  if (!agentRunner) {
    throw new LlmUnavailableError("Code rewrite LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL).");
  }

  const dryRun = input.dryRun === true;
  const maxFiles = Number.isInteger(input.maxFiles) && Number(input.maxFiles) > 0 ? Math.min(Number(input.maxFiles), 12) : 6;
  const instruction = input.instruction.trim();
  const role = input.role || "delivery-engineer";
  const allCandidateFiles = resolveBoundaryFileCandidates({
    repoPath,
    whitelist: boundaryCodePaths,
    maxFiles: Math.max(maxFiles, 12),
    allowedExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss"]
  });
  const candidateFiles = filterCandidatesByRole(allCandidateFiles, role).slice(0, maxFiles);

  const fileSnippets = candidateFiles.map((path) => {
    const content = readFileSync(join(repoPath, path), "utf-8");
    return {
      path,
      preview: content.slice(0, 1800)
    };
  });
  if (fileSnippets.length === 0) {
    throw new Error("rewrite boundary is not ready: no editable files found in boundary codePaths");
  }

  const prompt = {
    agentId: `agent-bounded-rewrite-${role}-1`,
    role: role as "delivery-engineer" | "frontend-developer" | "backend-developer",
    scope: "iteration" as const,
    goal: `按白名单路径生成增量改写结果（role=${role}）`,
    expectedOutput: "JSON: {summary,warnings[],edits:[{path,reason,content}]}",
    systemPrompt: [
      "你是 BuildWise 增量改写器。",
      "严格遵守边界白名单 codePaths；不得输出边界外路径。",
      "你必须将验收标准作为硬约束优先满足，不能仅当备注处理。",
      "仅输出 JSON，不要 markdown。",
      "content 必须是目标文件完整内容（不是 diff）。",
      "如果无法安全改写，返回空 edits 并在 warnings 说明。"
    ].join("\n"),
    userPrompt: [
      `用户指令：${instruction}`,
      `白名单 codePaths：${boundaryCodePaths.join(" | ")}`,
      `验收标准(scope.acceptanceCriteria)：${acceptanceCriteria.join(" | ") || "-"}`,
      `执行验收约束(executableConstraints.acceptanceChecks)：${acceptanceChecks.join(" | ") || "-"}`,
      `候选文件：${candidateFiles.join(" | ")}`,
      "文件片段：",
      ...fileSnippets.map((item) => `---\npath=${item.path}\n${item.preview}`),
      "请输出 JSON: {summary,warnings[],edits:[{path,reason,content}]}"
    ].join("\n\n")
  };
  const llmResult = await agentRunner.run(prompt);
  const parsed = safeJsonParse(llmResult.content);
  const warnings = Array.isArray(parsed?.warnings)
    ? parsed!.warnings.map((item) => pickString(item)).filter(Boolean).slice(0, 12)
    : [];
  const summary = pickString(parsed?.summary) || "已完成边界内改写建议。";
  const rawEdits = Array.isArray(parsed?.edits) ? parsed!.edits : [];
  if (rawEdits.length === 0) {
    throw new Error("rewrite payload empty: no edits returned by LLM");
  }
  const outOfBoundaryFiles: string[] = [];
  const outOfCandidateFiles: string[] = [];
  const appliedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const edits: IterationCodeRewriteResponse["edits"] = [];
  const candidateSet = new Set(candidateFiles.map((item) => normalizeRelPath(item)));

  for (const item of rawEdits.slice(0, maxFiles)) {
    const row = item as Record<string, unknown>;
    const path = normalizeRelPath(pickString(row.path));
    const reason = pickString(row.reason) || "LLM rewrite";
    const content = pickString(row.content);
    if (!path || !content) {
      continue;
    }
    if (!candidateSet.has(path)) {
      outOfCandidateFiles.push(path);
      continue;
    }
    const boundaryCheck = assertBoundaryWhitelist({
      repoPath,
      whitelist: boundaryCodePaths,
      changedPaths: [path]
    });
    if (!boundaryCheck.ok) {
      outOfBoundaryFiles.push(path);
      continue;
    }
    const before = readFileSync(join(repoPath, path), "utf-8");
    if (before === content) {
      skippedFiles.push(path);
      continue;
    }
    if (!dryRun) {
      writeFileSync(join(repoPath, path), content, "utf-8");
      appliedFiles.push(path);
    }
    edits.push({
      path,
      reason,
      beforePreview: previewText(before),
      afterPreview: previewText(content)
    });
  }

  if (edits.length === 0) {
    throw new Error("rewrite produced no valid edits after boundary and candidate validation");
  }

  return {
    iterationId,
    dryRun,
    summary,
    warnings:
      outOfCandidateFiles.length > 0
        ? [...warnings, `以下文件未在候选列表中，已忽略：${Array.from(new Set(outOfCandidateFiles)).slice(0, 6).join("、")}`]
        : warnings,
    appliedFiles: Array.from(new Set(appliedFiles)),
    skippedFiles: Array.from(new Set(skippedFiles)),
    outOfBoundaryFiles: Array.from(new Set(outOfBoundaryFiles)),
    edits
  };
}
