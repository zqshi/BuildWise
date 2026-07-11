# BuildWise v2

BuildWise v2 是当前主实现版本。  

**语言 / Language:** [中文](README.md) | [English](README.en.md)  
它把官网入口、登录、仪表盘、项目工作台、项目建模/领域建模、交付物抽屉、Agent 协作台、真实 LLM 分析链路和项目级 workspace 隔离收敛到同一套前后端工程里。

## 1. 当前能力

- 官网与登录入口：`#/` 与 `#/login`
- 仪表盘：项目总览、风险与近期动态
- 项目工作台：项目/迭代管理、需求上传、分析、边界、交付物、测试、发布评审
- 项目建模与领域建模：支持结构化摘要、节点关系图、业务实体卡片、规则映射与关系叙事
- 代码类交付物抽屉：按文件结构查看而不是整块堆叠
- Agent 协作台：单 Agent、多项目 workspace、项目知识上下文注入
- 项目知识目录：每项目写入 `workspacePath/.buildwise/`

## 2. 环境要求

- Node.js `>= 22`
- npm `>= 10`

## 3. 安装

```bash
cd v2
npm run install:all
```

## 4. 本地开发

推荐直接启动联调栈：

```bash
cd v2
npm run dev:stack:start
```

停止：

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

默认入口：

- 官网：`http://localhost:5173/#/`
- 登录：`http://localhost:5173/#/login`
- 仪表盘：`http://localhost:5173/#/dashboard`
- 后端：`http://127.0.0.1:5055`

开发联调说明：

- 当前前端在本地会优先通过同源 `/api` 代理访问后端，避免跨源白屏。
- 未显式设置 `VITE_API_BASE` 时，Vite dev/preview 会代理到本地后端。
- 若显式设置了本地跨端口 `VITE_API_BASE`，构建期 CSP 会自动放行对应 API origin；未显式设置时，运行时会回退到同源 `/api`。

## 5. 质量门禁

推荐执行：

```bash
cd v2
npm run verify:all
```

当前脚本包括：

- `npm run check:hygiene`
- `npm run check:boundaries`
- `npm run typecheck`
- `npm run build`
- `npm run report:readiness`
- `npm --prefix backend run check:boundaries`
- `npm --prefix backend run typecheck`
- `npm --prefix backend run build`
- `npm --prefix backend run test:contract`
- `npm --prefix backend run verify:prod-release`

CI 额外固定执行：

- `npm audit --audit-level=high --registry=https://registry.npmjs.org`（前端）
- `npm audit --audit-level=high --registry=https://registry.npmjs.org`（后端）

补充脚本：

- `npm test`
- `npm run seed:agentic:flow`
- `npm run e2e:creative-generator:rc`
- `npm run reset:business-env`
- `npm run clean:workspace`

## 6. 演示数据与真实链路

重建当前演示数据：

```bash
cd v2
npm run seed:agentic:flow
```

该命令会同步生成：

- `v2/backend/data.json`
- `v2/backend/data.runtime.json`
- `v2/backend/continuous-modeling.runtime.json`

恢复为干净可投产的初始业务环境：

```bash
cd v2
npm run reset:business-env
```

该命令会：

- 重建 `v2/backend/data.json` 与 `v2/backend/data.runtime.json` 为初始 seed store
- 清空 `v2/backend/continuous-modeling.runtime.json`
- 删除 `.artifacts/`、`memory/`、`index/`、`shards/`、`workspace.json`、`.buildwise/`、`tmp/e2e-reports/`

演示项目当前包含：

- 1 个项目
- 2 个迭代（`V1` / `V1.1`）
- 项目知识库
- continuous-modeling 快照
- 业务友好的实体、规则、关系和 review task

相关文档：

- [agentic-flow-mock-dataset.md](./docs/agentic-flow-mock-dataset.md)
- [真实 LLM 演示链路说明](./docs/openclaw-real-llm-demo.md)
- [Agent 动态编排治理说明](./docs/openclaw-agentic-flow-governance.md)
- [creative-generator-demo-requirement.md](./docs/creative-generator-demo-requirement.md)

## 7. 构建与生产运行

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

生产要求：

- 显式配置 `VITE_API_BASE`
- 每个项目绑定独立 `workspacePath`
- `workspacePath/.buildwise/` 保留读写权限并纳入备份
- 不要把 `.buildwise/` 纳入 Git

## 8. 关键环境变量

后端支持读取 `v2/backend/.env`：

```bash
cd v2/backend
cp .env.example .env
```

生产模板：

```bash
cd v2/backend
cp .env.production.example .env
```

关键项：

- `HOST` / `PORT`
- `NODE_ENV`
- `CORS_ORIGINS`
- `AUTH_MODE=off | token | jwt`
- `AUTH_TOKENS_JSON`
- `JWT_SECRET`
- `STORAGE_BACKEND=sqlite`（JSON backend 已废弃，传 `json` 会被静默降级为 sqlite）
- `WORKSPACE_DB_FILE`
- `WORKSPACE_DATA_FILE`
- `LLM_PROVIDER`
- `LLM_API_BASE`
- `LLM_API_KEY`
- `LLM_MODEL`
- `LLM_REQUIRED`
- `GITHUB_TOKEN`
- `PROJECT_REPO_ROOT`

受控发布验证：

```bash
cd v2/backend
npm run verify:prod-release
```

项目 workspace 绑定约束：

- 接口：`POST /api/v1/projects/:id/workspace/bind`
- `workspacePath` 建议使用绝对路径
- 同一路径不能绑定多个项目，冲突返回 `409 workspace_path_already_bound`
- 项目知识索引、daily memory 与分片文档默认写入 `workspacePath/.buildwise/`

## 9. API 与仓库治理

后端当前使用 `/api/v1` 前缀。常用接口包括：

- `GET /api/v1/status`
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:id/iterations`
- `POST /api/v1/projects/:id/iterations`
- `GET /api/v1/projects/:id/model-view`
- `GET /api/v1/projects/:id/model/business-summary`
- `POST /api/v1/projects/:id/workspace/bind`
- `POST /api/v1/projects/:id/repository/bootstrap`
- `GET /api/v1/projects/:id/repository/status`
- `POST /api/v1/iterations/:id/publish`

仓库模式：

- `external_git`
- `managed_local`
- `hybrid`

## 10. 当前状态说明

BuildWise v2 当前已经是可运行、可演示、可持续治理的主实现。  
当前发布候选分支已通过本地 `check:boundaries`、`verify:all` 和 `verify:prod-readiness`，可以作为评审、演示和受控投产候选使用。

仍需注意：

- 最终生产放行要以真实环境中的 `verify:prod-release`（含契约验证）、部署配置和运维检查为准
- README 说明的是当前实现与运行方式，不等于替代正式上线 SOP
- 生产配置、密钥、域名、备份和工作区权限仍要按后端生产文档逐项确认

## 11. 继续阅读

- [v2/backend/README.md](./backend/README.md)
- [docs/README.md](../docs/README.md)
