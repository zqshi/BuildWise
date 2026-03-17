# 重建工程治理基线

## 目的

将本次系统性重建纳入统一工程约束，防止以“重构”为名引入新的超大文件、重复文档、重复脚本和跨层耦合。

## 强制规则

1. 使用 DDD + TDD。
2. 所有文件不超过 1000 行。
3. 单文件单职责。
4. 新增上下文必须有目录边界与 README/索引。
5. 行为变更必须附测试。
6. 架构决策必须写入 ADR。
7. 旧链路冻结，不得继续叠加新能力。

## 本轮重建 in scope

- 文档结构重组与索引更新
- `continuous-modeling` 领域骨架
- `ontology-language` 对应承接策略
- OpenClaw skill 路由升级
- 首批模型快照服务与测试骨架

## 本轮重建 out of scope

- 一次性替换全部页面
- 一次性迁移全部旧数据
- 一次性移除旧 `workspace` 全部逻辑

## 目录约定

后端新增上下文时遵循：

- `src/domain/<context>/`
- `src/application/<context>/`
- `src/infrastructure/<context>/`
- `src/interfaces/http/routes/<context>*.ts`

文档遵循：

- `docs/02-domain/`
- `docs/03-architecture/`
- `docs/04-engineering/`
- `docs/05-delivery/`
- `docs/06-adr/`

## 测试要求

本轮起新增能力至少覆盖：

- 领域级单元测试
- 应用服务测试
- 关键契约测试或路由测试

若暂未接入 HTTP 路由，也必须先完成领域与应用服务测试。

## 旧链路边界收敛

- `repository/bootstrap` 只负责登记仓库配置和治理参数，不承担网络探测。
- 远端可达性校验统一收敛到显式 `repository/validate`、`repository/status` 与发布前门禁。
- 任何需要访问真实远端的流程都必须通过独立测试覆盖，避免在初始化配置时引入环境耦合。
- OpenClaw、coach、项目总览等主工作台只允许消费统一 `project_model_view`，不得再直接拼接 `knowledgeBase` 形成第二套业务摘要。
- 交付物写入会话必须统一经过单一消息发布策略；`commit`、阶段流转、显式追加到会话不得各自重复拼装消息或各自决定去重规则。
- 前端只保留历史消息兼容与展示层归并，不允许再透传未使用的“交付物追加到聊天”空链路。
- `prototype-preview`、`technical-architecture`、`code-delivery`、`test-matrix` 必须作为同一执行 loop 维护；不得把代码和测试当成一次性生成文案。
- OpenClaw 在开发/测试阶段必须明确返回当前 loop 状态、阻断项、修正动作和可验证证据，未形成 loop 的代码交付不得标记为可发布。
- 上述 loop 不得只体现在 prompt 或页面文案中，必须沉淀为正式运行时状态 `productionDeliveryLoop`，并由自动测试锁定其状态推导与发布门禁行为。

## 同步更新要求

以下变更必须同轮完成：

- 代码
- 测试
- 文档索引
- 架构说明
- skill 链说明

## 风险控制

- 对旧 `modeling` 上下文只做只读和缺陷修复。
- 不允许再把正式模型新增到 `v2/model.json`。
- 对现有超大文件继续实施递减治理，不在本轮扩张。
