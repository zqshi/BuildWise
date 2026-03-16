# BuildWise

> 将业务意图编译为可运行软件。

BuildWise 不是一个“帮你快一点写代码”的普通 AI 工具，而是一套面向现代软件团队的 AI 原生交付系统。它试图解决的核心问题，不是生成速度，而是软件交付过程中最昂贵的失真: 业务意图在产品、设计、研发、测试和发布之间被层层转述，最终偏离原始目标。

BuildWise 的路径是把需求表达、系统建模、软件生成与交付治理拉回到同一条可追溯链路中。业务先被沉淀为统一项目模型，再由模型驱动页面、接口、规则、测试和发布动作，最后把影响分析、验证、回滚和治理一起纳入闭环。

## 为什么是 BuildWise

传统软件交付的问题，往往不是没人干活，而是每一层都在重复翻译：

- 业务想表达目标，最后变成零散需求单。
- 产品想定义结构，最后变成难以追溯的文档集合。
- 研发想保障可演进，最后只能在频繁变更中被动返工。
- AI 想提升效率，最后却经常只提供一段不可治理的结果。

BuildWise 的目标是把这条链路重新组织起来：

- 先理解业务意图，而不是先生成页面。
- 先编译统一项目模型，而不是先堆临时代码。
- 先建立交付治理闭环，而不是上线前再补控制手段。

## 产品主张

BuildWise 当前已经形成一条相对完整的产品叙事：

- 多源输入：语言、草图、设计稿都可以进入同一系统。
- 模型驱动：围绕单一事实来源组织页面、接口、规则与交互资产。
- 变更同步：需求变化后可以识别影响范围并做增量修正。
- 治理交付：测试产物、发布评审、快照与回滚依据天然留痕。

这条链路对应三个连续阶段：

1. Capture：理解业务意图，把目标、范围、规则与例外转成系统可识别的表达。
2. Compile：沉淀统一项目模型，让页面、数据、接口与业务规则进入同一蓝图。
3. Deliver：进入交付治理，让生成、验证、发布、回滚和追溯同频发生。

## 当前版本已经具备什么

当前主线实现位于 `v2/`，已经落地为一套可运行的前后端工作台，而不是停留在概念稿：

- 官网入口：对外展示产品定位、核心能力和交付路径。
- 登录与工作台：支持从官网进入业务工作区。
- 仪表盘：展示项目与迭代的整体状态。
- 项目工作台：支持项目/迭代管理、附件上传分析、交付物编辑、变更影响分析、测试产物生成与发布评审。
- 权限治理：将角色与平台治理入口纳入系统化管理。
- OpenClaw 协作台：支持面向治理和 Agent 协作的工作方式。
- 仓库治理链路：支持 repository bootstrap、mode、provision、scaffold、publish 与代码追溯。
- 真实 LLM 链路：支持真实模型接入，而不是只跑 mock fallback。

## 适合什么团队

BuildWise 更适合这些场景：

- 业务需求频繁变化，但又不能接受每次都从头返工。
- 希望用 AI 提升交付效率，但不能牺牲结构、验证和可治理性。
- 想把“需求理解、软件生成、质量控制、发布依据”放回同一系统。
- 需要从单次生成工具，升级为可持续演进的交付工作台。

## 快速体验

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

默认访问入口：

- 官网：`#/`
- 登录：`#/login`
- 工作台：`#/dashboard`

默认后端监听 `127.0.0.1:5055`。

如果要停止联调栈：

```bash
cd v2
npm run dev:stack:stop
```

## 如何验证它不只是“展示页”

BuildWise 当前仓库已经内置完整质量门禁和真实演示链路。

执行一键校验：

```bash
cd v2
npm run verify:all
```

它会覆盖前端仓库卫生、边界检查、类型检查、构建、后端 Skill 合规、就绪度报告以及后端契约测试。

如果要验证更接近生产的后端能力：

```bash
cd v2/backend
npm run verify:prod-readiness
```

如果要直接演示产品链路：

```bash
cd v2
npm run seed:agentic:flow
npm run demo:openclaw:real
```

## 仓库结构

```text
.
├── v2/             # 当前主版本：前端、脚本、测试、补充文档
├── v2/backend/     # 后端服务、契约测试、运维与投产能力
├── docs/           # 产品、架构、治理与里程碑文档
├── autoboot/       # 自举流程、计划、报告与执行产物
├── backend/        # 历史/过渡目录
├── legacy/         # 历史版本与兼容内容
└── tmp/            # 临时产物
```

## 关键文档入口

- 产品与运行总览：`v2/README.md`
- 后端接口与投产说明：`v2/backend/README.md`
- 产品/架构/治理文档索引：`docs/README.md`
- 真实 OpenClaw + LLM 演示：`v2/docs/openclaw-real-llm-demo.md`
- Agentic Flow Mock 数据集说明：`v2/docs/agentic-flow-mock-dataset.md`

## 关键后端能力

后端已经提供一套围绕交付治理设计的核心接口：

- 健康与就绪探针：`/health`、`/ready`、`/api/status`
- 项目与迭代：`/api/projects`、`/api/projects/:id/iterations`
- 仓库治理：`/api/projects/:id/repository/*`
- 发布链路：`/api/iterations/:id/publish`
- 变更治理：`/api/iterations/:id/change-control/*`
- 全链路分析：`/api/iterations/:id/full-cycle`
- 模型与追溯：`/api/model`、`/api/trace`、`/api/projects/:id/code-trace`

## 配置入口

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

- GitHub 首页应展示本文件；[docs/README.md](/Users/zqs/Downloads/project/BuildWise/docs/README.md) 仅作为文档目录索引。
- 当前工作区可能包含运行期工件和本地未提交文件，提交时应避免把无关产物一并纳入。
