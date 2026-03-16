# BuildWise

> 将业务意图编译为可运行软件。

BuildWise 是一个面向现代软件团队的 AI 原生交付系统。它关注的不是“更快生成一段代码”，而是把需求表达、系统建模、软件生成、验证发布与回滚治理重新拉回同一条可追溯链路。

在传统流程里，业务、产品、设计、研发、测试和发布往往在持续重复翻译同一件事，需求越复杂、变更越频繁，失真成本就越高。BuildWise 试图改变的正是这一点：先把业务意图沉淀为统一项目模型，再让模型驱动页面、接口、规则、测试和交付动作，最后把影响分析、验证依据、发布评审和回滚能力纳入闭环。

## 产品定位

BuildWise 不是单点 AI 工具，而是一套围绕“统一项目模型”组织的软件交付工作台。

它的目标不是只回答“能不能生成”，而是同时回答下面这些问题：

- 业务目标到底是什么。
- 需求变化后会影响哪里。
- 页面、接口、规则之间如何保持一致。
- 这次交付是否有足够的验证和发布依据。
- 当结果不理想时，是否可以追溯、回滚和继续演进。

## 核心主张

- 多源输入：语言、草图、设计稿都可以进入同一系统。
- 模型驱动：围绕单一事实来源组织页面、接口、规则与交互资产。
- 变更同步：需求变化后可以识别影响范围并做增量修正。
- 治理交付：测试产物、发布评审、快照与回滚依据天然留痕。

这条路径对应三个连续阶段：

1. Capture：理解业务意图，把目标、范围、规则与例外转成系统可识别的表达。
2. Compile：沉淀统一项目模型，让页面、数据、接口与业务规则进入同一蓝图。
3. Deliver：进入交付治理，让生成、验证、发布、回滚和追溯同频发生。

## 为什么这件事重要

传统软件交付的问题，往往不是没人做事，而是每一层都在重复解释：

- 业务想表达目标，最后变成零散需求单。
- 产品想定义结构，最后变成难以追溯的文档集合。
- 研发想保障可演进，最后只能在频繁变更中被动返工。
- AI 想提升效率，最后却经常只提供一段不可治理的结果。

BuildWise 的方法不是在原流程上再叠一层聊天框，而是重新组织整条交付路径：

- 先理解业务意图，而不是先生成页面。
- 先编译统一项目模型，而不是先堆临时代码。
- 先建立交付治理闭环，而不是上线前再补控制手段。

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

## 典型使用场景

- 从模糊需求到项目建模：把口头需求、业务规则和设计输入沉淀为统一项目模型。
- 从需求变化到影响识别：在迭代中快速看清“改哪里、影响什么、怎么验证”。
- 从生成结果到发布治理：把测试产物、发布评审、代码追溯和回滚依据绑定在同一交付链路里。
- 从个人 AI 工具到团队系统：不再让 AI 输出停留在个人电脑，而是进入团队可协作、可审计、可治理的环境。

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

如果只想单独启动后端：

```bash
cd v2/backend
npm run dev
```

默认访问入口：

- 官网：`#/`
- 登录：`#/login`
- 工作台：`#/dashboard`

默认后端监听 `127.0.0.1:5055`。

停止联调栈：

```bash
cd v2
npm run dev:stack:stop
```

## 如何验证它不只是“展示页”

BuildWise 当前仓库已经内置完整质量门禁和真实演示链路：

- `cd v2 && npm run verify:all`
- `cd v2/backend && npm run verify:prod-readiness`
- `cd v2 && npm run seed:agentic:flow`
- `cd v2 && npm run demo:openclaw:real`

这些能力覆盖前端仓库卫生、边界检查、类型检查、构建、后端 Skill 合规、契约测试、生产就绪校验，以及真实 OpenClaw + LLM 演示流程。

## 当前仓库里有什么

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

## 产品入口与核心链路

后端已经提供一套围绕交付治理设计的核心接口：

- 健康与就绪探针：`/health`、`/ready`、`/api/status`
- 项目与迭代：`/api/projects`、`/api/projects/:id/iterations`
- 仓库治理：`/api/projects/:id/repository/*`
- 发布链路：`/api/iterations/:id/publish`
- 变更治理：`/api/iterations/:id/change-control/*`
- 全链路分析：`/api/iterations/:id/full-cycle`
- 模型与追溯：`/api/model`、`/api/trace`、`/api/projects/:id/code-trace`

## 推荐阅读路径

- 想快速理解产品与运行方式：`v2/README.md`
- 想看后端接口与投产说明：`v2/backend/README.md`
- 想看产品、架构与治理资料：`docs/README.md`
- 想跑真实 OpenClaw + LLM 演示：`v2/docs/openclaw-real-llm-demo.md`
- 想理解当前 Agentic Flow Mock 数据集：`v2/docs/agentic-flow-mock-dataset.md`

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

## 当前限制

- 这仍然是一个持续演进中的产品仓库，不是已经完全封装好的商业发行版。
- 仓库里可能包含运行期工件、联调数据和本地未提交文件，提交时需要明确边界。
- 当前首页 README 是基于仓库里已经存在的实现能力编写的产品化说明，不是脱离代码现状的纯市场文案。

## 说明

- GitHub 首页应展示本文件；[docs/README.md](/Users/zqs/Downloads/project/BuildWise/docs/README.md) 仅作为文档目录索引。
- 我尝试参考你给出的 `zqshi/After-sales`，但当前公开访问返回 404，因此这次调整是基于“产品型首页结构”的最佳近似，而不是逐段复刻那个仓库。
