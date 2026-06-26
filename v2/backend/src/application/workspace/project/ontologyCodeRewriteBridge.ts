/**
 * ontologyCodeRewriteBridge — 编码 agent 改动回流本体
 *
 * V4 核心价值闭环：编码 agent 真实改代码后，把实际改动路径合并进 KB.codeMap，
 * 让本体四向映射随真实代码演进（而非仅随 LLM 分析/boundary 声明演进）。
 *
 * 纯函数无副作用，KB 持久化由调用方执行（与 extractKnowledgeBaseUpdateOp 风格一致）。
 */

import type { ProjectKnowledgeBase } from "../../../domain/workspace/projectTypes";
import type { CodeRewriteEdit } from "../quality/codeRewriteJobOps";

export type CodeRewriteOntologyResult = {
  updatedKb: ProjectKnowledgeBase;
  /** 本次回流新增的 codePaths（去重后） */
  mergedPaths: string[];
};

/**
 * 把编码 agent 的改动合并进本体 codeMap。
 *
 * 策略：
 * - 对每个 edit.path，若 codeMap 已有 capability 的 codePaths 含近似路径（路径前缀匹配），合并进去
 * - 否则新增一条 codeMap 项「编码改写记录」，记录该路径
 * - 去重，保持 codePaths 唯一
 */
export function mergeCodeRewriteIntoOntology(
  existingKb: ProjectKnowledgeBase,
  edits: CodeRewriteEdit[]
): CodeRewriteOntologyResult {
  const codeMap = existingKb.codeMap.map((item) => ({ ...item, codePaths: [...item.codePaths] }));
  const mergedPaths: string[] = [];

  for (const edit of edits) {
    const path = edit.path.trim();
    if (!path) continue;
    const matchedIndex = findMatchingCodeMapIndex(codeMap, path);
    if (matchedIndex >= 0) {
      const target = codeMap[matchedIndex]!;
      if (!target.codePaths.includes(path)) {
        target.codePaths.push(path);
        mergedPaths.push(path);
      }
    } else {
      codeMap.push({
        capability: `编码改写记录：${path}`,
        codePaths: [path],
        tests: [],
      });
      mergedPaths.push(path);
    }
  }

  return {
    updatedKb: { ...existingKb, codeMap },
    mergedPaths,
  };
}

function findMatchingCodeMapIndex(
  codeMap: Array<{ capability: string; codePaths: string[]; tests: string[] }>,
  path: string
): number {
  // 路径前缀匹配：若已有 codePaths 中某项是 path 的前缀目录，或 path 以已有项为前缀，视为同一 capability
  for (let i = 0; i < codeMap.length; i++) {
    const item = codeMap[i]!;
    for (const existing of item.codePaths) {
      if (path === existing) return i;
      if (path.startsWith(`${existing.replace(/\/$/, "")}/`)) return i;
      if (existing.startsWith(`${path.replace(/\/$/, "")}/`)) return i;
    }
  }
  return -1;
}
