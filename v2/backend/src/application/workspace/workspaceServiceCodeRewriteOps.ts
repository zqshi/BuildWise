import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { IterationCodeRewriteResponse } from "../../domain/workspace/types";
import { LlmUnavailableError, type AgentRunner } from "./agentRunner";
import { assertBoundaryWhitelist, resolveBoundaryFileCandidates } from "./boundaryGuard";
import { normalizeIteration, normalizeProject } from "./workspaceSupport";

function normalizeRelPath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+/g, "/").trim();
}

function safeJsonParse(value: string) {
  const text = value.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function previewText(content: string, maxLength = 320) {
  return content.replace(/\s+/g, " ").slice(0, maxLength);
}

export async function rewriteCodeInBoundaryOp(
  repo: WorkspaceRepository,
  agentRunner: AgentRunner | null,
  iterationId: number,
  input: { instruction: string; dryRun?: boolean; maxFiles?: number }
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
  if (!repoPath || boundaryCodePaths.length === 0) {
    return {
      iterationId,
      dryRun: input.dryRun !== false,
      summary: "未执行改写：缺少可用仓库路径或代码边界白名单。",
      warnings: ["请先在边界确认中补齐 codePaths。"],
      appliedFiles: [],
      skippedFiles: [],
      outOfBoundaryFiles: [],
      edits: []
    };
  }
  if (!agentRunner) {
    throw new LlmUnavailableError("Code rewrite LLM is not configured. Set LLM_API_BASE (and optional LLM_API_KEY / LLM_MODEL).");
  }

  const dryRun = input.dryRun !== false;
  const maxFiles = Number.isInteger(input.maxFiles) && Number(input.maxFiles) > 0 ? Math.min(Number(input.maxFiles), 12) : 6;
  const instruction = input.instruction.trim();
  const candidateFiles = resolveBoundaryFileCandidates({
    repoPath,
    whitelist: boundaryCodePaths,
    maxFiles,
    allowedExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss"]
  });

  const fileSnippets = candidateFiles.map((path) => {
    const content = readFileSync(join(repoPath, path), "utf-8");
    return {
      path,
      preview: content.slice(0, 1800)
    };
  });
  if (fileSnippets.length === 0) {
    return {
      iterationId,
      dryRun,
      summary: "未执行改写：边界路径内未发现可改写文本文件。",
      warnings: ["请确认 codePaths 是否指向可编辑代码文件。"],
      appliedFiles: [],
      skippedFiles: [],
      outOfBoundaryFiles: [],
      edits: []
    };
  }

  const prompt = {
    agentId: "agent-bounded-rewrite-1",
    role: "delivery-engineer" as const,
    scope: "iteration" as const,
    goal: "按白名单路径生成增量改写结果",
    expectedOutput: "JSON: {summary,warnings[],edits:[{path,reason,content}]}",
    systemPrompt: [
      "你是 BuildWise 增量改写器。",
      "严格遵守边界白名单 codePaths；不得输出边界外路径。",
      "仅输出 JSON，不要 markdown。",
      "content 必须是目标文件完整内容（不是 diff）。",
      "如果无法安全改写，返回空 edits 并在 warnings 说明。"
    ].join("\n"),
    userPrompt: [
      `用户指令：${instruction}`,
      `白名单 codePaths：${boundaryCodePaths.join(" | ")}`,
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
