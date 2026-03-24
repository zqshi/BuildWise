# BuildWise 文档索引

本目录同时包含：

1. 当前仍然有效的执行规范
2. 体系设计与升级方案
3. 商业规划与历史阶段文档

为了避免重复和过时口径，阅读时请区分“**当前有效文档**”和“**历史/归档文档**”。

## 当前有效文档

优先阅读这些：

- 产品总览与对外定位：
  - [README.md](/Users/zqs/Downloads/project/BuildWise/README.md)
- 当前主实现运行说明：
  - [v2/README.md](/Users/zqs/Downloads/project/BuildWise/v2/README.md)
- 后端、接口与投产说明：
  - [v2/backend/README.md](/Users/zqs/Downloads/project/BuildWise/v2/backend/README.md)
  - [production-operations.md](/Users/zqs/Downloads/project/BuildWise/v2/backend/docs/production-operations.md)
  - [production-readiness.md](/Users/zqs/Downloads/project/BuildWise/v2/backend/docs/production-readiness.md)
  - [release-candidate-checklist.md](/Users/zqs/Downloads/project/BuildWise/v2/backend/docs/release-candidate-checklist.md)

## 当前产品与架构基线

- [10-产品顶层设计（执行版）.md](/Users/zqs/Downloads/project/BuildWise/docs/10-产品顶层设计（执行版）.md)
- [20-技术架构设计（执行版）.md](/Users/zqs/Downloads/project/BuildWise/docs/20-技术架构设计（执行版）.md)
- [20-统一项目模型设计.md](/Users/zqs/Downloads/project/BuildWise/docs/20-统一项目模型设计.md)
- [20-追溯模型（Trace Model）.md](/Users/zqs/Downloads/project/BuildWise/docs/20-追溯模型（Trace Model）.md)
- [20-DDD分层与边界规范.md](/Users/zqs/Downloads/project/BuildWise/docs/20-DDD分层与边界规范.md)
- [42-研发治理规范（DDD-TDD-质量门禁）.md](/Users/zqs/Downloads/project/BuildWise/docs/42-研发治理规范（DDD-TDD-质量门禁）.md)
- [47-DDD+TDD与1000行治理最高声明.md](/Users/zqs/Downloads/project/BuildWise/docs/47-DDD+TDD与1000行治理最高声明.md)
- [51-系统性治理升级设计.md](/Users/zqs/Downloads/project/BuildWise/docs/51-系统性治理升级设计.md)

## v2 专项文档

- [agentic-flow-mock-dataset.md](/Users/zqs/Downloads/project/BuildWise/v2/docs/agentic-flow-mock-dataset.md)
- [openclaw-agentic-flow-governance.md](/Users/zqs/Downloads/project/BuildWise/v2/docs/openclaw-agentic-flow-governance.md)
- [openclaw-real-llm-demo.md](/Users/zqs/Downloads/project/BuildWise/v2/docs/openclaw-real-llm-demo.md)
- [iteration-ontology-impact-contract.md](/Users/zqs/Downloads/project/BuildWise/v2/docs/iteration-ontology-impact-contract.md)

## 历史/归档文档

以下文档仍保留，但主要用于背景、商业规划或历史阶段参考，不应直接当作当前运行事实：

- `【0】“构想即应用”*.md`
- `【1】「构想即应用」*.md`
- `【2】「构想智造」*.md`
- `【3】「构想智造」*.md`
- `30-*`、`32-*` 中偏阶段规划的历史版本
- `44-*`、`45-*`、`46-*` 中的阶段性升级方案与时序图
- `50-upgrade/*` 中的专项升级分文档
- `milestones/*` 中的里程碑与历史就绪度报告

## 文档治理原则

1. 对外口径以根 README 为准。
2. 当前实现与运行方式以 `v2/README.md` 和 `v2/backend/README.md` 为准。
3. 投产、运维和放行条件以后端 `docs/` 下的生产文档为准。
4. 历史方案文档保留，但必须视为“背景材料”，不能覆盖当前主口径。
