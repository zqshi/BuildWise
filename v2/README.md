# BuildWise v2 交付与运行指南

## 1. 环境要求

- Node.js >= 20
- npm >= 10

## 2. 安装依赖

```bash
cd v2
npm run install:all
```

## 3. 一键质量验证（发布前必跑）

```bash
cd v2
npm run verify:all
```

该命令会依次执行：

- 前端边界检查
- 前端类型检查
- 前端构建
- 前后端接口完备度报告生成
- 后端边界检查
- 后端类型检查
- 后端构建
- 后端契约测试

## 4. 开发模式

一键启动前后端（推荐）：

```bash
cd v2
npm run dev:stack:start
```

一键停止：

```bash
cd v2
npm run dev:stack:stop
```

前端：

```bash
cd v2
npm run dev
```

后端：

```bash
cd v2/backend
npm run dev
```

## 5. 生产启动

前端静态构建：

```bash
cd v2
npm run build
```

后端启动：

```bash
cd v2/backend
npm run build
npm run start
```

默认后端监听 `127.0.0.1:5055`。

可用环境变量：

- `PORT`：端口（默认 `5055`）
- `HOST`：监听地址（默认 `127.0.0.1`）
- `NODE_ENV`：运行环境（`development | test | production`）
- `SERVICE_NAME`：服务名
- `SERVICE_VERSION`：服务版本
- `MODEL_FILE`：模型文件路径（默认 `v2/model.json`）
- `WORKSPACE_DATA_FILE`：工作区数据文件路径（默认 `v2/backend/data.runtime.json`）
- `CORS_ORIGINS`：允许跨域来源，生产环境需显式配置
- `RATE_LIMIT_WINDOW_MS`：限流窗口毫秒数
- `RATE_LIMIT_MAX`：窗口内单 IP 请求上限
- `SHUTDOWN_TIMEOUT_MS`：优雅停机超时时间
- `GITHUB_TOKEN`：GitHub API Token（用于项目仓库真实建仓）
- `PROJECT_REPO_ROOT`：本地项目仓库生成根目录（用于仓库骨架落盘）
- `AUTH_MODE`：后端鉴权模式（`off | token`）
- `AUTH_TOKENS_JSON`：Bearer Token 与角色映射
- `AUTH_PUBLIC_PATH_PREFIXES`：免鉴权路径前缀
- `STORAGE_BACKEND`：工作区存储后端（`json | sqlite`）
- `WORKSPACE_DB_FILE`：SQLite 数据文件路径
- `LLM_API_BASE`：OpenAI 兼容接口地址（例如 `https://api.openai.com/v1`）
- `LLM_API_KEY`：大模型 API Key
- `LLM_MODEL`：模型名（默认 `gpt-4o-mini`）

## 6. 交付产物

- 前端：`v2/dist`
- 后端：`v2/backend/dist`
- 阶段报告：`docs/milestones`

## 7. 仓库治理（强制执行）

```bash
cd v2
npm run check:hygiene
```

若需清理本地构建与运行期产物：

```bash
cd v2
npm run clean:workspace
```
