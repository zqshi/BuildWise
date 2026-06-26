#!/usr/bin/env node
/**
 * dryRun 实跑脚本：真实触发编码 agent code-rewrite，验证 ClaudeCodeCliAdapter 端到端。
 *
 * 前置条件：
 * 1. claude CLI 已安装（which claude → /opt/homebrew/bin/claude）
 * 2. BuildWise 后端已启动（npm run dev:stack:start 或 cd backend && npm run dev）
 * 3. 存在一个已配置代码仓库 + 边界白名单 codePaths 的迭代
 *
 * 用法：
 *   node scripts/dryrun-code-rewrite.mjs <baseUrl> <iterationId> <instruction> [token]
 * 例：
 *   node scripts/dryrun-code-rewrite.mjs http://127.0.0.1:5055 10 "把登录按钮文案改成「登录」" <jwt-token>
 *
 * 流程：
 *   1. POST /iterations/:id/code-rewrite → 返回 {jobId, status:"pending"}
 *   2. 轮询 GET /iterations/:id/code-rewrite/:jobId 直到 completed/failed
 *   3. 打印 edits（合法改动）+ boundaryViolations（越界回滚）
 *
 * 安全：编码 agent 真实改代码。建议在临时 git 仓库（git init 干净副本）上跑，
 *       确认 boundaryCodePaths 白名单已锁定，越界改动会被回滚。
 */

const baseUrl = process.argv[2] || "http://127.0.0.1:5055";
const iterationId = process.argv[3] || "10";
const instruction = process.argv[4] || "把按钮文案改成「提交」";
const token = process.argv[5] || "";

if (!baseUrl || !iterationId) {
  console.error("用法: node scripts/dryrun-code-rewrite.mjs <baseUrl> <iterationId> <instruction> [token]");
  process.exit(1);
}

const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

async function main() {
  console.log(`[dryrun] POST ${baseUrl}/api/v1/iterations/${iterationId}/code-rewrite`);
  console.log(`[dryrun] instruction: ${instruction}`);
  const startRes = await fetch(`${baseUrl}/api/v1/iterations/${iterationId}/code-rewrite`, {
    method: "POST", headers,
    body: JSON.stringify({ instruction, dryRun: false }),
  });
  if (!startRes.ok) {
    console.error(`[dryrun] POST 失败 ${startRes.status}: ${await startRes.text()}`);
    process.exit(1);
  }
  const startBody = await startRes.json();
  if (!startBody.jobId) {
    console.error("[dryrun] 未返回 jobId——后端可能未启用编码 agent（BUILDWISE_CODING_AGENT_ENABLED）或迭代无边界白名单。回退到同步路径。");
    console.log("[dryrun] 同步结果:", JSON.stringify(startBody, null, 2));
    process.exit(0);
  }
  const jobId = startBody.jobId;
  console.log(`[dryrun] jobId=${jobId} status=pending，开始轮询...`);

  const startedAt = Date.now();
  const maxWaitMs = 10 * 60 * 1000;
  for (;;) {
    if (Date.now() - startedAt > maxWaitMs) {
      console.error(`[dryrun] 超时（${maxWaitMs / 1000}s）`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(`${baseUrl}/api/v1/iterations/${iterationId}/code-rewrite/${jobId}`, { headers });
    const job = await pollRes.json();
    console.log(`[dryrun] status=${job.status} events=${job.events?.length ?? 0}`);
    if (job.status === "completed") {
      console.log("\n=== 完成 ===");
      console.log(`合法改动 ${job.edits.length} 项:`);
      for (const e of job.edits) console.log(`  - ${e.path}: ${e.afterPreview.slice(0, 80)}`);
      console.log(`\n边界违规（已回滚）${job.boundaryViolations.length} 项:`);
      for (const v of job.boundaryViolations) console.log(`  - ${v.path} (${v.action})`);
      process.exit(0);
    }
    if (job.status === "failed" || job.status === "timeout") {
      console.error(`\n=== 失败 ===\nstatus=${job.status}\nerror=${job.error}`);
      process.exit(1);
    }
  }
}

main().catch((err) => { console.error("[dryrun] 异常:", err); process.exit(1); });
