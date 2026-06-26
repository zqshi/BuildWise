/**
 * codeRewritePostVerify — 编码 agent 改动的事后边界校验（纯函数）
 *
 * 范式转变核心：agent 自由改代码 → BuildWise 用 git diff 提取改动 →
 * assertBoundaryWhitelist 校验越界 → 违规路径标记回滚 → 合法改动生成 edits。
 *
 * 纯函数无 IO 副作用，IO（git checkout 回滚 / 读文件 before-after）由调用方执行，
 * 便于 mock 测试。
 */

import { assertBoundaryWhitelist } from "../shared/boundaryGuard";
import type { BoundaryViolation, CodeRewriteEdit } from "./codeRewriteJobOps";

export type ChangedFile = {
  path: string;
  beforeContent: string;
  afterContent: string;
};

export type PostVerifyResult = {
  edits: CodeRewriteEdit[];
  violations: BoundaryViolation[];
  /** 违规路径（需调用方回滚） */
  violationPaths: string[];
};

function previewText(content: string, maxLength = 320): string {
  return content.replace(/\s+/g, " ").slice(0, maxLength);
}

/**
 * 对编码 agent 产生的改动做事后边界校验。
 *
 * - 用 assertBoundaryWhitelist 把 changedFiles 分为合法/违规
 * - 违规路径不生成 edit，标记为 reverted（调用方负责 git checkout 回滚）
 * - 合法改动生成 CodeRewriteEdit（含 before/after preview）
 */
export function verifyCodingAgentChanges(params: {
  whitelist: string[];
  repoPath: string;
  changedFiles: ChangedFile[];
}): PostVerifyResult {
  const { whitelist, repoPath, changedFiles } = params;
  const changedPaths = changedFiles.map((f) => f.path);
  const boundaryCheck = assertBoundaryWhitelist({ repoPath, whitelist, changedPaths });
  const violationSet = new Set(boundaryCheck.violations);

  const edits: CodeRewriteEdit[] = [];
  const violations: BoundaryViolation[] = [];

  for (const file of changedFiles) {
    if (violationSet.has(file.path)) {
      violations.push({ path: file.path, action: "reverted" });
      continue;
    }
    if (file.beforeContent === file.afterContent) continue;
    edits.push({
      path: file.path,
      reason: "编码 agent 改写",
      beforePreview: previewText(file.beforeContent),
      afterPreview: previewText(file.afterContent),
    });
  }

  return { edits, violations, violationPaths: boundaryCheck.violations };
}
