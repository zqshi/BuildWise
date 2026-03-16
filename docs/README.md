# BuildWise 文档目录

本目录记录产品愿景、商业计划、功能清单、技术与实施规范。为保持长期可维护性，文档采用统一的编号命名。

## 快速入口

- 项目运行与交付总览：`v2/README.md`
- 后端运行、接口与投产说明：`v2/backend/README.md`
- v2 当前补充文档目录：`v2/docs`

## 文档结构规范

- `00-` 纲领与目录
- `10-` 产品与业务
- `20-` 技术与架构
- `30-` 研发流程与交付
- `40-` 运营与市场

## 现有核心文档（保留原名）

- `【0】“构想即应用”：面向非技术创造者的AI原生软件构建平台思考分析报告.md`
- `【1】「构想即应用」AI原生软件构建平台商机计划书.md`
- `【2】「构想智造」产品顶层设计与落地规划.md`
- `【3】「构想智造」三阶段完整产品功能清单.md`

## 新增规范文档

- `00-文档结构规范.md`
- `10-产品顶层设计（执行版）.md`
- `20-技术栈与架构.md`
- `20-技术架构设计（执行版）.md`
- `21-代码结构.md`
- `20-统一项目模型设计.md`
- `20-追溯模型（Trace Model）.md`
- `22-前端长期迭代治理策略.md`
- `30-自举流水线扩展规则.md`
- `31-里程碑模板.md`
- `40-工程执行标准（技术栈与模式）.md`
- `41-UI设计规范（统一风格）.md`
- `42-研发治理规范（DDD-TDD-质量门禁）.md`
- `43-任务执行上下文读取协议.md`
- `46-IM与Agent协作执行时序图.md`
- `47-DDD+TDD与1000行治理最高声明.md`

## v2 近期交付与治理文档

- `v2/docs/agentic-flow-mock-dataset.md`
- `v2/docs/openclaw-agentic-flow-governance.md`
- `v2/docs/openclaw-real-llm-demo.md`
- `v2/docs/openclaw-skills-implementation.md`
- `v2/docs/creative-generator-demo-requirement.md`
- `v2/docs/agent-skills-product-rd-evaluation.md`
- `v2/docs/iteration-ontology-impact-contract.md`
- `v2/docs/ui-style-upgrade-acceptance-2026-03-09.md`
- `v2/docs/visual-e2e-alignment-browser-use-2026-03-09.md`

## 执行前必读顺序（强制）

1. `10-产品顶层设计（执行版）.md`
2. `20-技术架构设计（执行版）.md`
3. `20-DDD分层与边界规范.md`
4. `40-工程执行标准（技术栈与模式）.md`
5. `42-研发治理规范（DDD-TDD-质量门禁）.md`
6. `43-任务执行上下文读取协议.md`
7. `30-目标驱动自举执行蓝图.md`
8. `47-DDD+TDD与1000行治理最高声明.md`

## 统一质量门禁

- 仓库卫生：`cd v2 && npm run check:hygiene`
- 前端：`npm run check:boundaries && npm run typecheck && npm run build`
- 前后端一键校验：`cd v2 && npm run verify:all`
- 后端：`npm --prefix backend run check:boundaries && npm --prefix backend run typecheck && npm --prefix backend run build && npm --prefix backend run test:contract`
- 后端投产就绪校验：`npm --prefix backend run verify:prod-readiness`

## 文档模板

- `templates/PRD-需求文档模板.md`
- `templates/技术方案模板.md`
- `templates/ADR-决策记录模板.md`
