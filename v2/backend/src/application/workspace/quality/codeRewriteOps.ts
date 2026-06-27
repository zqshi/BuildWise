/**
 * codeRewriteOps — 代码改写入口（re-export 桥接）
 *
 * 子模块（按改写路径拆分，单向依赖，无循环）：
 * - llmCodeRewriteOps: LLM 改写路径（AgentRunner 生成增量改写 + 原子化写盘回滚）
 * - agentCodeRewriteOps: 编码 agent 改写路径（真实改代码 + git diff + 事后边界校验回滚）
 */

// re-export 供既有调用方继续从本文件 import（兼容层）
export {
  resolveRewriteContext,
  buildRewritePrompt,
  applyRewriteEditsAtomic,
  rewriteCodeInBoundaryOp
} from './llmCodeRewriteOps';
export {
  executeCodeRewriteViaAgent,
  realCodeRewriteGitOps
} from './agentCodeRewriteOps';
export type {
  CodeRewriteGitOps,
  CodeRewriteAgentContext,
  CodeRewriteAgentResult
} from './agentCodeRewriteOps';
