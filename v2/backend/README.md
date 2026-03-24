# BuildWise v2 Backend

BuildWise 后端负责：

- 项目 / 迭代数据管理
- 项目建模与领域建模统一视图
- 交付物、测试矩阵与发布评审
- 项目级 workspace 绑定与知识物化
- OpenClaw 非侵入式接入
- 仓库治理、发布与回滚链路

## 1. 快速开始

```bash
cd v2/backend
npm install
npm run build
npm run start
```

开发模式：

```bash
npm run dev
```

## 2. 环境变量

启动时自动读取：

- `v2/backend/.env`

可从模板复制：

```bash
cp .env.example .env
```

关键变量：

- `HOST` / `PORT`
- `NODE_ENV`
- `CORS_ORIGINS`
- `AUTH_MODE=off | token | jwt`
- `AUTH_TOKENS_JSON`
- `JWT_SECRET`
- `JWT_ACCESS_TTL_SEC`
- `JWT_REFRESH_TTL_SEC`
- `AUTH_PUBLIC_PATH_PREFIXES`
- `STORAGE_BACKEND=json | sqlite`
- `WORKSPACE_DB_FILE`
- `WORKSPACE_DATA_FILE`
- `LLM_PROVIDER`
- `LLM_API_BASE`
- `LLM_API_KEY`
- `LLM_MODEL`
- `LLM_REQUIRED`
- `DEPENDENCY_REQUIRED`
- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_AGENT_ID`
- `OPENCLAW_HOME`
- `BUILDWISE_OPENCLAW_SKILLS_ENABLED`
- `GITHUB_TOKEN`
- `PROJECT_REPO_ROOT`

说明：

- 生产环境建议 `AUTH_MODE=jwt`
- 生产环境建议 `STORAGE_BACKEND=sqlite`
- 每个项目必须使用独立 `workspacePath`
- 项目知识目录写入 `workspacePath/.buildwise/`

## 3. 质量门禁

```bash
npm run check:hygiene
npm run check:boundaries
npm run check:prompts
npm run check:prompts:replay
npm run check:agents
npm run check:skills
npm run typecheck
npm run build
npm run test
npm run test:contract
npm run verify:prod-readiness
npm run verify:prod-readiness:sqlite
```

补充：

- `npm run ops:preflight`
- `npm run ops:llm-check`
- `npm run ops:alerts`
- `PROJECT_ID=1 npm run ops:rollback`
- `STORAGE_BACKEND=sqlite npm run ops:backup-drill`

## 4. 关键接口

后端当前统一使用 `/api/v1` 前缀。

核心运行接口：

- `GET /health`
- `GET /ready`
- `GET /api/v1/status`
- `GET /api/ops/runtime`

项目与迭代：

- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:id/iterations`
- `POST /api/v1/projects/:id/iterations`

项目建模：

- `GET /api/v1/projects/:id/model-view`
- `GET /api/v1/projects/:id/model/business-summary`

OpenClaw / workspace：

- `POST /api/v1/projects/:id/workspace/bind`
- `POST /api/v1/projects/:id/policies/restore-initial`
- `POST /api/governance/orchestration/policies/restore-initial`

仓库治理与发布：

- `GET /api/v1/projects/:id/repository`
- `POST /api/v1/projects/:id/repository/bootstrap`
- `GET /api/v1/projects/:id/repository/status`
- `GET /api/v1/projects/:id/repository/migration-plan`
- `POST /api/v1/projects/:id/repository/mode`
- `POST /api/v1/projects/:id/repository/provision`
- `POST /api/v1/projects/:id/repository/scaffold`
- `POST /api/v1/iterations/:id/publish`
- `GET /api/v1/projects/:id/code-trace?ref=<branch|tag|commit|path>`

变更控制：

- `GET /api/v1/iterations/:id/change-control`
- `POST /api/v1/iterations/:id/change-control/confirm`
- `POST /api/v1/iterations/:id/change-control/boundary`
- `POST /api/v1/iterations/:id/change-control/test-matrix/execution`
- `POST /api/v1/iterations/:id/change-control/test-artifacts/generate`
- `GET /api/v1/iterations/:id/release-review`

## 5. 运行语义

- `/health`
  - liveness
  - 仅表示进程是否存活
  - 优雅停机期间返回 `503`
- `/ready`
  - readiness
  - 反映存储探针、模型文件和 LLM 连通性
- `/api/v1/status`
  - 查看运行时摘要

说明：

- 启动阶段会异步探测一次 LLM，不再阻塞监听
- `runtime.llmRequired` 表示是否启用 LLM 强依赖门禁
- `runtime.dependencyRequired` 表示是否启用依赖探针强门禁

## 6. OpenClaw 与项目 workspace

当前设计是：

1. 单 Agent
2. 每个项目一个独立 workspace
3. 所有迭代持续沉淀到同一个项目 workspace
4. BuildWise 只做知识物化、检索和上下文注入，不改 OpenClaw 内核

约束：

- `workspacePath` 建议使用绝对路径
- 同一路径不可绑定多个项目
- 绑定冲突返回 `409 workspace_path_already_bound`
- 项目知识目录位于：
  - `workspacePath/.buildwise/workspace.json`
  - `workspacePath/.buildwise/memory/`
  - `workspacePath/.buildwise/shards/`
  - `workspacePath/.buildwise/index/`

## 7. 投产说明

当前投产与运维主文档：

- [production-operations.md](./docs/production-operations.md)
- [production-readiness.md](./docs/production-readiness.md)
- [release-candidate-checklist.md](./docs/release-candidate-checklist.md)

注意：

- 是否“可投产”必须以当前门禁实际结果为准
- 如果 `check:boundaries`、`verify:prod-readiness` 未全绿，就不能宣称该分支已可直接投产
