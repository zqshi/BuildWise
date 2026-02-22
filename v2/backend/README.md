# BuildWise v2 Backend

## 快速开始

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

环境变量加载：

- 服务启动会自动读取当前目录的 `.env`（路径：`v2/backend/.env`）。
- 若同时存在 shell 环境变量和 `.env`，以 shell 环境变量优先。
- 可从模板复制：

```bash
cd v2/backend
cp .env.example .env
```

## 质量门禁

```bash
npm run check:boundaries
npm run typecheck
npm run build
npm run test:contract
npm run test:contract:sqlite
npm run verify:prod-readiness
npm run verify:prod-readiness:sqlite
npm run ops:preflight
npm run ops:llm-check
npm run ops:alerts
npm run ops:rollback
npm run ops:backup-drill
```

投产差距与分项评分见：
`v2/backend/docs/production-readiness.md`
投产运维 SOP 见：
`v2/backend/docs/production-operations.md`

## 关键接口

- `GET /health`
- `GET /ready`
- `GET /api/status`
- `GET /api/ops/runtime`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id/repository`
- `POST /api/projects/:id/repository/bootstrap`
- `POST /api/projects/:id/repository/provision`
- `POST /api/projects/:id/repository/scaffold`
- `POST /api/iterations/:id/publish`
- `GET /api/projects/:id/iterations`
- `POST /api/projects/:id/iterations`
- `GET /api/iterations/:id/code-link`
- `POST /api/iterations/:id/code-link`
- `GET /api/projects/:id/code-trace?ref=<branch|tag|commit|path>`
- `GET /api/iterations/:id/change-control`
- `POST /api/iterations/:id/change-control/confirm`
- `POST /api/iterations/:id/change-control/boundary`
- `POST /api/iterations/:id/change-control/test-matrix/execution`
- `GET /api/model`
- `GET /api/model/entities`
- `POST /api/model/entities`
- `GET /api/rules/compile`
- `GET /api/rules/bind`
- `GET /api/sync/report`
- `GET /api/trace`
- `GET /api/trace/map`

## 配置

- 默认监听 `127.0.0.1:5055`
- `PORT` 可覆盖端口
- `HOST` 可覆盖监听地址
- `NODE_ENV`：`development | test | production`
- `SERVICE_NAME`：服务名（默认 `buildwise-v2-backend`）
- `SERVICE_VERSION`：服务版本（默认 `0.1.0`）
- `MODEL_FILE` 可覆盖模型文件路径
- `WORKSPACE_DATA_FILE` 可覆盖工作区数据路径
- `LLM_API_BASE`：OpenAI 兼容接口地址（必填，用于附件分析真实调用）
- `LLM_MODEL`：模型名称（默认 `gpt-4o-mini`）
- `LLM_API_KEY`：模型 API Key（按服务端要求配置）
- `LLM_REQUIRED`：`true|false`（默认 `false`）。为 `true` 时，`/ready` 需要 LLM 可达才返回 ready
- `DEPENDENCY_REQUIRED`：`true|false`（默认 `production=true`，其他环境 `false`）。为 `true` 时，`/ready` 需要模型文件和存储依赖探针通过
- `LLM_FOLDER_MAX_FILES`：文件夹分析纳入文件上限（默认 `120`）
- `LLM_FOLDER_MANIFEST_MAX_FILES`：文件夹分析 manifest 输出上限（默认 `60`）
- `LLM_FOLDER_EXCERPT_MAX_FILES`：文件夹分析文本摘录文件上限（默认 `20`）
- `GITHUB_TOKEN`：GitHub API Token（用于 `repository/provision` 真实建仓）
- `PROJECT_REPO_ROOT`：本地仓库落盘根目录（用于 `repository/scaffold`）
- `CORS_ORIGINS`：允许跨域来源，多个值用逗号分隔（生产环境必填）
- `RATE_LIMIT_WINDOW_MS`：限流窗口毫秒数（默认 `60000`）
- `RATE_LIMIT_MAX`：窗口内每 IP 请求上限（默认 `2000`）
- `SHUTDOWN_TIMEOUT_MS`：优雅停机超时毫秒（默认 `10000`）
- `AUTH_MODE`：`off | token`（生产建议 `token`）
- `AUTH_TOKENS_JSON`：token 到角色映射 JSON（`AUTH_MODE=token` 时必填）
- `AUTH_PUBLIC_PATH_PREFIXES`：免鉴权路径前缀，逗号分隔
- `STORAGE_BACKEND`：`json | sqlite`（生产建议 `sqlite`）
- `WORKSPACE_DB_FILE`：SQLite 工作区数据库文件路径
- `ALERT_MIN_TEST_MATRIX_COVERAGE`：测试矩阵生成覆盖率阈值（`ops:preflight`，默认 `100`）
- `ALERT_MIN_TEST_MATRIX_EXECUTION_COVERAGE`：测试矩阵执行覆盖率阈值（`ops:preflight`，默认 `100`）
- `ALERT_MIN_TEST_MATRIX_PASS_RATE`：测试矩阵执行通过率阈值（`ops:preflight`，默认 `95`）
- `ALERT_MIN_HIGH_VALUE_FINDINGS_COVERAGE`：高价值发现覆盖率阈值（`ops:preflight`，默认 `90`）
- `ALERT_MAX_P0_FINDINGS_TOTAL`：P0 发现总量上限（`ops:preflight`，默认 `5`）
- `ALERT_MAX_IGNORED_FILES_RATIO`：分析被忽略文件比例上限（`ops:preflight`，默认 `70`）

说明：

- `/api/iterations/:id/analysis` 已禁用 fallback mock 路径。
- 若未配置可用 LLM（例如缺少 `LLM_API_BASE`），该接口将返回 `503`。
- 服务启动会探测一次 LLM 连通性，`/api/status` 与 `/api/ops/runtime` 的 `runtime.llm` 字段可查看 `configured/reachable/error`。
- `runtime.llmRequired` 可查看当前是否启用“LLM 强依赖就绪门禁”。
- `runtime.dependencies` 与 `runtime.dependencyRequired` 可查看“模型文件/存储”依赖探针状态与是否启用强依赖门禁。

## 投产补齐能力

- 统一错误响应：返回 `requestId` 便于排障。
- 基础安全响应头：`x-content-type-options`、`x-frame-options`、`referrer-policy`。
- 进程内限流：按 IP 进行滑动窗口控制，超限返回 `429`。
- 健康与就绪探针分离：`/health` + `/ready`。
- 运行时指标快照：`/api/ops/runtime`。
- 优雅停机：处理 `SIGINT/SIGTERM`，停止接入新请求并等待关闭。

## 建仓与追溯示例

- 初始化仓库元信息：
  `POST /api/projects/:id/repository/bootstrap`
- 真实建仓（GitHub）：
  `POST /api/projects/:id/repository/provision`，传 `{ "dryRun": false }` 且配置 `GITHUB_TOKEN`
- 仅演练不落地：
  `POST /api/projects/:id/repository/provision`，传 `{ "dryRun": true }`
- 生成本地工程骨架并初始化 git：
  `POST /api/projects/:id/repository/scaffold`，可传 `{ "rootDir": "/tmp/repos", "initializeGit": true, "createInitialCommit": true }`
- 发布迭代分支并创建 PR（dry-run 默认 true）：
  `POST /api/iterations/:id/publish`
- 绑定迭代到代码锚点：
  `POST /api/iterations/:id/code-link`
- 根据 commit/branch/path 反查迭代：
  `GET /api/projects/:id/code-trace?ref=abc123`

## 存储迁移（JSON -> SQLite）

```bash
cd v2/backend
npm run migrate:sqlite
```

迁移后可通过环境变量切换：

```bash
STORAGE_BACKEND=sqlite
WORKSPACE_DB_FILE=./workspace.db
```

SQLite 模式下已提供分集合表存储与索引（`projects`、`iterations`、`messages`、`audit_logs`），高频读取走 SQL 查询。

## Agent Prompt 维护

- Prompt 模板目录：`v2/backend/prompts`
- 命名约定：`agent.<role>.v1.md`
- 目前支持角色：
  - `orchestrator`
  - `requirements-analyst`
  - `task-planner`
  - `delivery-engineer`
  - `qa-reviewer`
- 模板格式要求：
  - 必须包含 `# system` 与 `# user` 两段
  - 可用变量：`{{role}}` `{{scope}}` `{{goal}}` `{{context}}` `{{expectedOutput}}`
- 运行时加载逻辑：
  - 代码位置：`src/application/workspace/workspaceSupport.ts`
  - 若模板缺失或格式不合法，将自动回退到内置默认模板。
- LLM 调用链路与 Prompt 体系说明：
  - `v2/backend/docs/llm-chain-and-prompts.md`
