/**
 * check-version-discipline — 版本纪律校验
 *
 * 校验 docs/versions/ 目录的版本化纪律（参照 arc 迭代声明纪律）：
 * 1. docs/versions/ 目录存在
 * 2. 有且仅有一个 *-current.md（当前活跃版本）
 * 3. 存在 backlog.md（后续版本规划池）
 * 4. 存在 TEMPLATE.md（版本文件模板）
 * 5. 无 *-next.md 与 *-current.md 同时多于一个（防版本切换残留）
 *
 * 失败则 exit(1)，挂载于 npm run verify:all。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const ROOT = path.resolve(path.join(SCRIPT_DIR, ".."));
const VERSIONS_DIR = path.join(ROOT, "..", "docs", "versions");

const errors = [];

if (!existsSync(VERSIONS_DIR)) {
  errors.push(`docs/versions/ 目录不存在：${VERSIONS_DIR}`);
} else {
  const entries = readdirSync(VERSIONS_DIR).filter((name) => !name.startsWith("."));
  const currentFiles = entries.filter((name) => name.endsWith("-current.md"));
  const nextFiles = entries.filter((name) => name.endsWith("-next.md"));
  const hasBacklog = entries.includes("backlog.md");
  const hasTemplate = entries.includes("TEMPLATE.md");

  if (currentFiles.length === 0) {
    errors.push("docs/versions/ 下无 *-current.md 文件——必须有且仅有一个当前活跃版本");
  }
  if (currentFiles.length > 1) {
    errors.push(`docs/versions/ 下有 ${currentFiles.length} 个 *-current.md（${currentFiles.join("、")}）——必须仅有一个，请完成版本切换归档`);
  }
  if (nextFiles.length > 1) {
    errors.push(`docs/versions/ 下有 ${nextFiles.length} 个 *-next.md（${nextFiles.join("、")}）——next 最多一个`);
  }
  if (!hasBacklog) {
    errors.push("docs/versions/backlog.md 不存在——需要后续版本规划池");
  }
  if (!hasTemplate) {
    errors.push("docs/versions/TEMPLATE.md 不存在——需要版本文件模板");
  }

  if (currentFiles.length === 1) {
    const currentPath = path.join(VERSIONS_DIR, currentFiles[0]);
    const content = readFileSyncSafe(currentPath);
    if (content && !/\|\s*ID\s*\|.*\|\s*状态\s*\|/i.test(content) && !/\|\s*ID\s*\|.*\|.*状态.*\|/i.test(content)) {
      errors.push(`${currentFiles[0]} 缺少任务依赖表（需含 ID/任务/状态 列）`);
    }
  }
}

function readFileSyncSafe(filePath) {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

if (errors.length > 0) {
  console.error("Version discipline check failed:");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log("Version discipline check passed.");
