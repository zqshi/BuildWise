# BuildWise v2 Backend Release Candidate Checklist

更新时间：2026-03-23

## 1. 目标

用于把“当前仓库可运行”收口为“可放行的生产候选版本”。

## 2. 放行前必须为真

1. 工作树已清理，发布内容可明确归属。
2. `npm run verify:prod-readiness` 通过。
3. `npm run verify:prod-readiness:sqlite` 在 CI 或真实环境通过。
4. `AUTH_MODE=jwt`。
5. `JWT_SECRET` 已替换为生产密钥，长度不少于 32。
6. `CORS_ORIGINS` 已配置为真实域名。
7. `STORAGE_BACKEND=sqlite`。
8. `VITE_API_BASE` 已显式配置。
9. 每个项目 `workspacePath` 独立且可写。
10. `workspacePath/.buildwise/` 已纳入备份策略。

## 3. 运行语义确认

1. `/health`
   - 作为 liveness
   - 仅表示进程是否存活
   - 仅在优雅停机阶段返回 `503`
2. `/ready`
   - 作为 readiness
   - 依赖存储探针、模型文件状态、LLM 连通性
3. `/api/v1/status`
   - 用于查看运行时摘要
4. `POST /api/v1/projects/:id/workspace/bind`
   - 同一路径不得复用到多个项目
   - 冲突返回 `409 workspace_path_already_bound`

## 4. OpenClaw 集成确认

1. 保持单 Agent，不为每个项目复制 Agent。
2. 每个项目一个独立 workspace。
3. 项目级 session：`agent:<agentId>:project-<projectId>`
4. 迭代级 session：`agent:<agentId>:project-<projectId>-iteration-<iterationId>`
5. BuildWise 只做知识物化、检索和上下文注入，不修改 OpenClaw 内核逻辑。

## 5. 项目知识目录确认

项目知识资产位于：

1. `workspacePath/.buildwise/workspace.json`
2. `workspacePath/.buildwise/memory/`
3. `workspacePath/.buildwise/shards/`
4. `workspacePath/.buildwise/index/`

要求：

1. 对运行账号可读写。
2. 被备份策略覆盖。
3. 不进入 Git 仓库。

## 6. 推荐验收命令

```bash
cd v2
npm run check:boundaries
npm run typecheck
npm run build
npm test

cd backend
npm run typecheck
npm run build
npm run test
npm run test:contract
npm run check:prompts
npm run check:prompts:replay
npm run verify:prod-readiness
```

## 7. 当前剩余风险

1. 当前仓库仍为脏工作树，必须先做 RC 切面整理。
2. SQLite 全链路门禁需要在真实 CI 或部署环境固定跑通。
3. 统一观测、告警联动和值班手册仍待补齐。
