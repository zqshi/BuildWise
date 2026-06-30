# BuildWise 部署运维手册

> 覆盖生产部署：环境准备、配置派生、服务编排、健康检查、运维 ops 脚本、回滚。
> 对应代码：`v2/docker-compose.yml` / `v2/backend/Dockerfile` / `v2/Dockerfile` / `v2/nginx.conf` / `v2/backend/.env.production.example`。

## 1. 概述

BuildWise 三服务部署：
- **backend**：Fastify，端口 5055，SQLite 持久化，智谱 GLM 分析引擎
- **frontend**：Vite 构建产物 + nginx 静态托管 + API 反向代理（端口 80）
- **openhands**：OpenHands agent-server（编码 agent 后端，agent-server 18000 容器内 / 8000 对外）

编排：`v2/docker-compose.yml`。TLS 由上游 LB/CDN 终止，nginx 听 80。

## 2. 前置条件

- Docker + docker-compose（容器部署）/ Node 22+（本地开发）
- 智谱 GLM API Key（智谱开放平台 open.bigmodel.cn）
- 生产 `.env`（基于 `v2/backend/.env.production.example` 派生）

## 3. 生产 .env 派生

复制 `v2/backend/.env.production.example` 为 `v2/backend/.env`，**必须替换**：

| 配置项 | 生产值 | 说明 |
|--------|--------|------|
| NODE_ENV | production | 触发 runtimeConfig 生产守卫 |
| HOST | 0.0.0.0 | 容器内监听 |
| CORS_ORIGINS | https://app.example.com | 替换为实际前端域名 |
| AUTH_MODE | jwt | 生产强制（off 拒绝启动） |
| JWT_SECRET | ≥32 字符强随机 | jwt 模式强制 |
| STORAGE_BACKEND | sqlite | |
| ALLOW_SEED_DATA_BOOTSTRAP | false | 生产禁种数据 |
| ANTHROPIC_BASE_URL | https://open.bigmodel.cn/api/anthropic | 智谱 Anthropic 兼容端点 |
| ANTHROPIC_AUTH_TOKEN | （智谱 token） | 与后端同源，不在 git 跟踪 |
| ANTHROPIC_MODEL | glm-5-turbo | 智谱 GLM 分层模型 |
| LLM_REQUIRED | false（或 true 强制） | true 时 LLM 不可用则启动失败 |

## 4. 鉴权注入（runtimeConfig 生产 fail-fast 守卫）

`v2/backend/src/infrastructure/runtime/runtimeConfig.ts` 在 `NODE_ENV=production` 时拒绝启动，除非：
- `AUTH_MODE` ∈ {token, jwt}（off 拒绝）
- `AUTH_MODE=jwt` 时 `JWT_SECRET` ≥32 字符
- `AUTH_MODE=token` 时 `AUTH_TOKENS_JSON` 无 placeholder（`change-me`）
- `ALLOW_SEED_DATA_BOOTSTRAP=false`
- `CORS_ORIGINS` 显式配置（非通配 `*`）

⚠️ **docker-compose 未显式注入 `AUTH_MODE`/`JWT_SECRET`/`CORS_ORIGINS`**——backend 通过 `env_file: ./backend/.env` 读取。开发 `.env` 是 `AUTH_MODE=off`，**直接用开发 .env 部署会在生产启动时 fail-fast 拒绝**（安全保护，非 bug）。部署前必须将 `.env` 替换为基于 `.env.production.example` 派生的生产配置。

## 5. 服务编排

```bash
cd v2
docker-compose up -d
```

服务依赖与卷：
- **backend**：5055，healthcheck `GET /ready`，依赖 repo-init 完成 + openhands healthy。卷 `backend-data`（sqlite）/ `repo-data`（项目 repo）。资源限制 1g/1cpu。
- **openhands**：8000 对外，healthcheck `GET /alive`。卷 `openhands-state`/`repo-data`。资源 2g/2cpu。
- **frontend**：80，nginx，依赖 backend healthy。资源 256m/0.5cpu。
- **repo-init**：alpine，初始化 `repo-data` 卷权限（chown 10001 + chmod 0777），完成后退出。

⚠️ **卷权限**：`repo-data` 需 backend(uid 100) + openhands(uid 10001) 共同读写，repo-init 用 chmod 0777 兼容。生产若需严格多 uid 隔离，后续改为统一 uid 或 ACL 策略。

## 6. 健康检查

| 端点 | 用途 |
|------|------|
| `GET /health` | 存活探针 |
| `GET /ready` | 就绪探针（含 LLM + 依赖状态） |
| `GET /api/v1/status` | 完整状态（runtime/llm/dependencies/requests） |

docker-compose backend healthcheck 用 `GET /ready`（30s 间隔，3 次重试）。

## 7. nginx 配置关注点

`v2/nginx.conf`：
- 安全头：CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Permissions-Policy
- API 限流：`limit_req 30r/s burst=60`（429 超限）
- `client_max_body_size 20m`（附件上传）
- ⚠️ **`proxy_read_timeout 180s`**：同步分析 `POST /iterations/:id/analyze` 多次 LLM 调用可能数分钟（实测 626s），超过 180s nginx 返回 504，但**后端继续执行**（结果写入 DB）。

  **建议**：
  - 前端用异步 full-cycle job：`POST /iterations/:id/full-cycle` 立即返回 jobId，前端轮询 `GET /iterations/:id/full-cycle/jobs/:jobId`，避免同步等待触发 nginx 504。
  - 或调大 `proxy_read_timeout`（如 600s）匹配 `ANALYSIS_JOB_TIMEOUT_MS`（默认 2700s = 45min）。

## 8. ops 运维脚本

```bash
cd v2/backend
npm run ops:preflight      # 部署前基线（preflight/alerts/llm 三项零告警）
npm run ops:llm-check      # LLM 配置/可达性
npm run ops:alerts         # 告警基线
npm run ops:backup-drill   # 备份恢复演练（sqlite 自动发现 workspace.db）
npm run ops:rollback       # 回滚最近部署
```

部署前建议 `ops:preflight` 确认基线无告警。`verify:prod-release`（`npm run verify:prod-release`）是更完整的生产发布验证（含契约 + 备份演练 + 三基线）。

## 9. 部署流程

1. 派生生产 `.env`（替换 `JWT_SECRET`/`CORS_ORIGINS`/`ANTHROPIC_AUTH_TOKEN`，确认 `AUTH_MODE=jwt`）
2. `docker-compose up -d`（首次）或滚动更新 `docker-compose up -d --build backend frontend`
3. `curl https://app.example.com/ready` 确认就绪
4. `cd v2/backend && npm run ops:preflight` 确认基线无告警

## 10. 回滚

```bash
cd v2/backend && npm run ops:rollback    # 回滚最近部署
# 或镜像回退
docker-compose down backend
docker-compose up -d backend  # 用前一版本镜像
```

`backend-data` 卷（sqlite）在回滚间保留，不丢数据。建议定期 `ops:backup-drill` 演练备份恢复。

## 11. 注意事项

- **同步分析超时**：见 §7，优先异步 full-cycle job 避免 nginx 504。
- **LLM 可用性**：智谱过载时分析降级（generatedTestMatrix 可能空），不阻断管道（编造防控兜底 block）；`LLM_REQUIRED=false` 时 LLM 不可用仍可启动（仅分析功能降级）。
- **OpenHands 可选**：未配 `OPENHANDS_BASE_URL` 时编码 agent 降级 claude-code-cli 或 LLM；docker-compose 部署由 compose 注入 `http://openhands:18000`。
- **经验扫描**：`BUILDWISE_EXPERIENCE_SCAN_ENABLED=1` 启用定时经验沉淀（消耗 LLM 额度，默认关；间隔 `BUILDWISE_EXPERIENCE_SCAN_INTERVAL_HOURS` 默认 6h）。
- **密钥卫生**：`.env` 已在 `.gitignore`，`ANTHROPIC_AUTH_TOKEN`/`JWT_SECRET` 不入库；生产密钥通过环境变量或密钥管理注入，不硬编码。
