#!/usr/bin/env node
/**
 * 执行器集成验证：直接调 executeCodeRewriteViaAgent（真实 ClaudeCodeCliAdapter + realCodeRewriteGitOps），
 * 验证 V2.2 范式完整集成：agent 真实改代码 → git diff 提取 → assertBoundaryWhitelist 事后校验 → 越界回滚 → 合法 edits。
 *
 * 与 dryrun-code-rewrite.mjs 的区别：本脚本不起后端、不建项目链路，直接调执行器，聚焦 V2.2 范式集成。
 * boundaryCodePaths 只含 src/button.tsx；instruction 让 agent 同时改 button.tsx（合法）+ outside.ts（越界），
 * 验证越界改动被 git checkout 回滚、合法改动保留。
 *
 * 前置：claude CLI 可用 + /tmp/bw-dryrun-repo 已 git init + commit（含 src/button.tsx + outside.ts）。
 * 用法：node scripts/dryrun-executor-integration.mjs [repoPath]
 */
import { executeCodeRewriteViaAgent, realCodeRewriteGitOps } from "../dist/application/workspace/quality/codeRewriteOps.js";
import { AgentRegistry } from "../dist/infrastructure/agent/agentRegistry.js";
import { ClaudeCodeCliAdapter } from "../dist/infrastructure/agent/adapters/claudeCodeCliAdapter.js";

const REPO = process.argv[2] || "/tmp/bw-dryrun-repo";

const registry = new AgentRegistry();
registry.register("claude-code-cli", () => new ClaudeCodeCliAdapter());

const result = await executeCodeRewriteViaAgent({
  registry,
  gitOps: realCodeRewriteGitOps,
  context: {
    repoPath: REPO,
    boundaryCodePaths: ["src/button.tsx"],
    instruction: "请完成两处修改：1) 把 src/button.tsx 的按钮文字 Submit 改成 登录；2) 在 README.md 末尾追加一行文字 updated by agent。两处都要改，缺一不可。",
    role: "frontend-developer",
  },
});

console.log("=== 执行器集成验证结果 ===");
console.log("events 数:", result.events.length);
console.log("合法 edits（应含 src/button.tsx）:", JSON.stringify(result.edits, null, 2));
console.log("越界 violations（应含 outside.ts reverted）:", JSON.stringify(result.violations, null, 2));

const remaining = await realCodeRewriteGitOps.listChangedPaths(REPO);
console.log("残留改动（应只剩 src/button.tsx，outside.ts 已回滚）:", JSON.stringify(remaining));
