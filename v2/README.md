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

公开官网入口：

- 默认未登录访问：`#/`
- 登录入口：`#/login`
- 登录后工作台：`#/dashboard`

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
- `BUILDWISE_PREFER_PROCESS_ENV`：默认 `0`。设置为 `1` 时，后端保留进程已有环境变量优先；默认会优先采用 `.env` 中的 LLM/Anthropic 配置，减少旧环境变量导致的鉴权异常

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

## 8. 前端设计风格基线

- 设计稿目录：`v2/stitch/buildwise_*`
- 视觉基线：品牌蓝 `#0066ff`、背景 `#f5f7f8`、高对比文本 `#0f1723`、圆角卡片与轻阴影
- 令牌入口：`v2/src/styles/base.css`（仅允许通过 token 调整全局风格）
- 页面样式分层：
  - 基础层：`base.css`
  - 布局层：`layout.css`
  - 仪表盘层：`dashboard.css`
  - 工作台层：`workspace-core.css` / `workspace-interactions.css`

视觉验收清单（本轮升级）：

- `v2/docs/ui-style-upgrade-acceptance-2026-03-09.md`

项目建模可视化补充：

- 项目总览「项目建模与领域建模」详情区支持 `结构化摘要 / 节点关系图` 视图切换
- 当实体关系为 `0` 时显示空态提示；关系节点过多时自动隐藏标签并截断展示高关联节点
- 节点关系图支持 `加载演示数据`（mock）开关，便于在空数据项目中预览视觉效果与交互
- 节点关系业务说明严格读取关系数据字段（如 `businessDescription / ontologyBasis / dataBasis`），不做模板兜底推断

## 9. 权限治理默认约束

- 平台内置角色固定为 `超级管理员` 与 `成员`，其中 `成员` 为新增成员默认角色。
- `角色权限` Tab 中，`超级管理员` 与 `成员` 均按系统内置角色显示，置灰且不支持手工配置。
- `成员管理` Tab 新增成员时，仅允许分配 `超级管理员` 或 `成员`。
- `成员` 默认不显示 `权限管理` 与 `业务助手` 入口。

## 10. 演示数据（Dashboard 单一 Mock 数据集）

重建当前唯一保留的 Dashboard mock 数据集（覆盖 `data.json` 与 `data.runtime.json`）：

```bash
cd v2
npm run seed:agentic:flow
```

该数据集仅保留 1 个项目、2 个迭代（首版本 + 后续版本/回滚分支），用于 `#/dashboard` 联调。

真实 OpenClaw + LLM 演示（逐环节强制校验真实模型调用）：

```bash
cd v2
npm run demo:openclaw:real
```

详见：`v2/docs/openclaw-real-llm-demo.md`
