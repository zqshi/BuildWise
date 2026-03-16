# BuildWise v2

BuildWise v2 是一个面向软件交付的 AI 原生工作台。当前版本已经把官网入口、登录、仪表盘、项目工作台、权限治理、OpenClaw 协作台、真实 LLM 分析链路与仓库发布链路收敛到同一套前后端工程中。

## 1. 当前能力

- 官网入口：未登录默认进入 `#/`，展示产品定位、方法链路与核心能力。
- 登录与工作台切换：登录后进入 `#/dashboard`，可在仪表盘、项目工作台、权限设置之间切换。
- 项目工作台：支持项目/迭代管理、附件上传分析、交付物编辑、变更影响分析、测试产物生成与发布评审。
- OpenClaw 工作台：支持以协作台方式进入治理与 Agent 交互链路。
- 仓库治理链路：后端已提供仓库 bootstrap、模式切换、真实建仓、骨架落盘、发布到远端等接口。
- 运维与验证：内置前后端边界检查、类型检查、构建、契约测试、Prompt/Agent/Skill 校验，以及真实 LLM/Browser Use 演示脚本。

## 2. 环境要求

- Node.js >= 20
- npm >= 10

## 3. 安装依赖

```bash
cd v2
npm run install:all
```

如果只需要单独安装后端：

```bash
cd v2/backend
npm install
```

## 4. 本地开发

推荐直接启动前后端联调栈：

```bash
cd v2
npm run dev:stack:start
```

停止联调栈：

```bash
cd v2
npm run dev:stack:stop
```

单独启动前端：

```bash
cd v2
npm run dev
```

单独启动后端：

```bash
cd v2/backend
npm run dev
```

默认访问入口：

- 官网：`#/`
- 登录：`#/login`
- 仪表盘：`#/dashboard`

后端默认监听 `127.0.0.1:5055`。当前前端在检测不到后端时，会在界面顶部直接提示开发启动命令。

## 5. 质量门禁与验证

发布前建议至少执行：

```bash
cd v2
npm run verify:all
```

该命令会串联执行：

- 前端仓库卫生检查 `npm run check:hygiene`
- 前端边界检查 `npm run check:boundaries`
- 后端 Skill 合规检查 `npm run check:skills`
- 前端类型检查与构建
- 就绪度报告 `npm run report:readiness`
- 后端边界检查、类型检查、构建、契约测试

后端更完整的质量门禁位于：

```bash
cd v2/backend
npm run verify:prod-readiness
```

扩展验证脚本包括：

- `npm run test:e2e`
- `npm run test:contract:sqlite`
- `npm run ops:preflight`
- `npm run ops:llm-check`
- `npm run ops:alerts`
- `npm run e2e:agent-flow`

## 6. 演示数据与真实链路

重建当前保留的 Agentic Flow Mock 数据集：

```bash
cd v2
npm run seed:agentic:flow
```

该数据集用于 `#/dashboard` 与项目工作台联调，包含 1 个项目和 2 个迭代（首版本 + 后续变更/回滚分支）。

执行真实 OpenClaw + LLM 演示：

```bash
cd v2
npm run demo:openclaw:real
```

相关说明文档：

- `v2/docs/agentic-flow-mock-dataset.md`
- `v2/docs/openclaw-real-llm-demo.md`
- `v2/docs/openclaw-agentic-flow-governance.md`
- `v2/docs/creative-generator-demo-requirement.md`

## 7. 生产构建与启动

前端构建：

```bash
cd v2
npm run build
```

后端构建与启动：

```bash
cd v2/backend
npm run build
npm run start
```

构建产物：

- 前端：`v2/dist`
- 后端：`v2/backend/dist`

## 8. 关键环境变量

后端支持自动读取 `v2/backend/.env`。可先从模板复制：

```bash
cd v2/backend
cp .env.example .env
```

常用环境变量如下：

- `HOST` / `PORT`：服务监听地址与端口，默认 `127.0.0.1:5055`
- `NODE_ENV`：`development | test | production`
- `CORS_ORIGINS`：允许跨域来源，生产环境需显式配置
- `AUTH_MODE`：`off | token`
- `AUTH_TOKENS_JSON`：Token 到角色映射
- `AUTH_PUBLIC_PATH_PREFIXES`：免鉴权路径前缀
- `STORAGE_BACKEND`：`json | sqlite`
- `WORKSPACE_DB_FILE`：SQLite 工作区文件
- `MODEL_FILE`：统一项目模型文件，默认 `../model.json`
- `WORKSPACE_DATA_FILE`：工作区数据文件，默认 `./data.runtime.json`
- `LLM_API_BASE`：OpenAI 兼容接口地址，`.env.example` 当前默认示例为 `https://api.deepseek.com`
- `LLM_API_KEY` / `LLM_MODEL`：模型认证与模型名，`.env.example` 默认模型为 `deepseek-chat`
- `LLM_REQUIRED`：为 `true` 时 `/ready` 需要 LLM 可达
- `DEPENDENCY_REQUIRED`：为 `true` 时 `/ready` 需要模型文件与存储依赖探针通过
- `BUILDWISE_PREFER_PROCESS_ENV`：设为 `1` 时保留进程环境变量优先，否则优先采用 `.env`
- `GITHUB_TOKEN`：真实建仓时使用
- `PROJECT_REPO_ROOT`：仓库骨架生成目录

更完整的配置与投产说明见 `v2/backend/README.md` 与 `v2/backend/docs/production-operations.md`。

## 9. 仓库治理与发布链路

后端已提供以下关键接口：

- `GET /api/projects/:id/repository`
- `POST /api/projects/:id/repository/bootstrap`
- `GET /api/projects/:id/repository/status`
- `GET /api/projects/:id/repository/migration-plan`
- `POST /api/projects/:id/repository/mode`
- `POST /api/projects/:id/repository/provision`
- `POST /api/projects/:id/repository/scaffold`
- `POST /api/iterations/:id/publish`
- `GET /api/projects/:id/code-trace?ref=<branch|tag|commit|path>`

支持的仓库模式：

- `external_git`
- `managed_local`
- `hybrid`

默认治理策略是生产环境要求远端仓库可配置，适合真实发布链路。

## 10. 前端界面与设计约束

- 样式令牌入口：`v2/src/styles/base.css`
- 页面能力入口：
  - 官网：`v2/src/pages/marketing`
  - 仪表盘：`v2/src/pages/dashboard`
  - 项目工作台：`v2/src/pages/projects`
  - 权限治理：`v2/src/pages/governance`
  - OpenClaw 协作面板：`v2/src/pages/layout/OpenclawWorkspacePanel.tsx`
- 视觉验收文档：`v2/docs/ui-style-upgrade-acceptance-2026-03-09.md`
- Browser Use 视觉对齐记录：`v2/docs/visual-e2e-alignment-browser-use-2026-03-09.md`

项目总览中的“项目建模与领域建模”已支持结构化摘要与节点关系图切换，空关系场景与大规模关系场景都有对应的展示约束。

## 11. 仓库卫生

执行仓库卫生检查：

```bash
cd v2
npm run check:hygiene
```

清理本地构建与运行期产物：

```bash
cd v2
npm run clean:workspace
```
