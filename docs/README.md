# BuildWise 文档索引

当前仓库只保留仍然有效、会被继续维护的文档。  
历史规划稿、阶段性升级草案、旧里程碑和重复规范已在治理收口中清理，不再作为背景材料保留。

## 当前有效文档

优先阅读这些：

- 产品总览与对外定位：
  - [README.md](../README.md)
- 当前主实现运行说明：
  - [v2/README.md](../v2/README.md)
- 后端、接口与投产说明：
  - [v2/backend/README.md](../v2/backend/README.md)
  - [production-operations.md](../v2/backend/docs/production-operations.md)
  - [production-readiness.md](../v2/backend/docs/production-readiness.md)
  - [release-candidate-checklist.md](../v2/backend/docs/release-candidate-checklist.md)

## 当前产品与架构基线

- [10-产品顶层设计（执行版）.md](./10-产品顶层设计（执行版）.md)
- [20-技术架构设计（执行版）.md](./20-技术架构设计（执行版）.md)
- [20-统一项目模型设计.md](./20-统一项目模型设计.md)
- [20-追溯模型（Trace Model）.md](./20-追溯模型（Trace Model）.md)
- [20-DDD分层与边界规范.md](./20-DDD分层与边界规范.md)
- [42-研发治理规范（DDD-TDD-质量门禁）.md](./42-研发治理规范（DDD-TDD-质量门禁）.md)
- [47-DDD+TDD与1000行治理最高声明.md](./47-DDD+TDD与1000行治理最高声明.md)
- [51-系统性治理升级设计.md](./51-系统性治理升级设计.md)

## v2 专项文档

- [agentic-flow-mock-dataset.md](../v2/docs/agentic-flow-mock-dataset.md)
- [openclaw-agentic-flow-governance.md](../v2/docs/openclaw-agentic-flow-governance.md)
- [openclaw-real-llm-demo.md](../v2/docs/openclaw-real-llm-demo.md)
- [iteration-ontology-impact-contract.md](../v2/docs/iteration-ontology-impact-contract.md)

## 模板

- [ADR-决策记录模板.md](./templates/ADR-决策记录模板.md)
- [PRD-需求文档模板.md](./templates/PRD-需求文档模板.md)
- [技术方案模板.md](./templates/技术方案模板.md)

## 文档治理原则

1. 对外口径以根 README 为准。
2. 当前实现与运行方式以 `v2/README.md` 和 `v2/backend/README.md` 为准。
3. 投产、运维和放行条件以后端 `docs/` 下的生产文档为准。
4. 新文档必须有明确职责，不能和现有执行版文档重复。
