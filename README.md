# BuildWise

BuildWise 是一个面向软件交付的 AI 原生工作台仓库。当前主线实现位于 `v2/`，已经把官网入口、登录、仪表盘、项目工作台、权限治理、OpenClaw 协作台、真实 LLM 分析链路与仓库发布链路整合到同一套前后端工程中。

## 当前项目状态

- 主交付版本：`v2/`
- 前端：React 18 + TypeScript + Vite
- 后端：Node.js + TypeScript + Fastify
- 当前能力：项目/迭代管理、附件分析、交付物编辑、变更影响分析、测试产物生成、发布评审、仓库 scaffold/provision/publish、OpenClaw 协作工作台
- 运行方式：支持前后端联调栈、本地 mock 数据集、真实 OpenClaw + LLM 演示链路

## 仓库结构

```text
.
├── v2/             # 当前主版本：前端、脚本、测试、补充文档
├── v2/backend/     # v2 后端服务、契约测试、生产运维脚本
├── docs/           # 产品、架构、治理与里程碑文档
├── autoboot/       # 自举流程、计划、报告与执行产物
├── backend/        # 历史/过渡目录
├── legacy/         # 历史版本与兼容内容
└── tmp/            # 临时产物
```

## 快速开始

环境要求：

- Node.js >= 20
- npm >= 10

安装依赖：

```bash
cd v2
npm run install:all
```

启动前后端联调栈：

```bash
cd v2
npm run dev:stack:start
```

停止联调栈：

```bash
cd v2
npm run dev:stack:stop
```

默认访问入口：

- 官网：`#/`
- 登录：`#/login`
- 工作台：`#/dashboard`

默认后端监听 `127.0.0.1:5055`。

## 质量门禁

推荐发布前执行：

```bash
cd v2
npm run verify:all
```

该命令会覆盖：

- 前端仓库卫生与边界检查
- 后端 Skill 合规检查
- 前端类型检查与构建
- 就绪度报告生成
- 后端边界检查、类型检查、构建与契约测试

后端更完整的投产校验：

```bash
cd v2/backend
npm run verify:prod-readiness
```

## 演示与真实链路

重建 Agentic Flow Mock 数据集：

```bash
cd v2
npm run seed:agentic:flow
```

执行真实 OpenClaw + LLM 演示：

```bash
cd v2
npm run demo:openclaw:real
```

## 关键文档入口

- v2 运行与交付说明：`v2/README.md`
- 后端接口与投产说明：`v2/backend/README.md`
- 产品/架构/治理文档目录：`docs/README.md`
- OpenClaw 与演示说明：`v2/docs/openclaw-real-llm-demo.md`

## 关键后端能力

后端已提供以下核心链路：

- 健康与就绪探针：`/health`、`/ready`、`/api/status`
- 项目与迭代：`/api/projects`、`/api/projects/:id/iterations`
- 仓库治理：`/api/projects/:id/repository/*`
- 发布链路：`/api/iterations/:id/publish`
- 变更治理：`/api/iterations/:id/change-control/*`
- 全链路分析：`/api/iterations/:id/full-cycle`
- 模型与追溯：`/api/model`、`/api/trace`、`/api/projects/:id/code-trace`

## 环境变量提示

后端默认从 `v2/backend/.env` 读取配置，可从模板初始化：

```bash
cd v2/backend
cp .env.example .env
```

常用变量包括：

- `HOST` / `PORT`
- `CORS_ORIGINS`
- `AUTH_MODE` / `AUTH_TOKENS_JSON`
- `STORAGE_BACKEND` / `WORKSPACE_DB_FILE`
- `LLM_API_BASE` / `LLM_API_KEY` / `LLM_MODEL`
- `LLM_REQUIRED` / `DEPENDENCY_REQUIRED`
- `GITHUB_TOKEN`
- `PROJECT_REPO_ROOT`

## 说明

- GitHub 首页应展示本文件；`docs/README.md` 仅作为文档目录索引。
- 仓库当前可能存在运行期工件和本地未提交文件，提交时应避免把无关产物一并纳入。
