# OpenClaw 承接统一持续建模架构

## 目的

明确 OpenClaw Agent + skills 在重建后的系统中承担什么、不承担什么，确保其能够承接项目迭代推进，而不是再次成为事实源碎片层。

## 结论

OpenClaw 负责：

- 编排
- 治理
- 业务确认任务推动
- 审计留痕
- 自然语言工作汇报与数字员工式交互
- 基于原型驱动的代码与测试 loop 推进，直到交付物达到可投产门槛

OpenClaw 不负责：

- 直接保存正式模型真相
- 绕过模型快照做最终结论
- 用会话文本替代领域对象

## 三层架构

### 1. 模型内核层

输入：

- 项目知识库
- 迭代变更输入
- 附件分析产物
- 仓库与接口元数据
- 业务确认结果

输出：

- 正式模型快照
- 候选快照
- 差异报告
- 待确认任务

### 2. OpenClaw 编排层

输入：

- 当前正式快照
- 上一版快照
- 候选快照
- 迭代上下文
- 用户消息

输出：

- skills 选择
- 阶段推进结果
- 风险与问题列表
- 需要业务确认的任务

### 3. 工作台交互层

输入：

- 模型快照
- 审批和确认任务
- 交付与追溯视图

输出：

- 业务确认动作
- 术语确认
- 规则确认
- 差异确认

交互要求：

- 用户必须能够直接用自然语言交代工作，不需要理解 skill 名称、合同字段或阶段机。
- 系统内部可以维持结构化契约，但前台必须呈现为“数字员工正在汇报执行情况、风险和下一步”。
- 只有在确实需要业务确认时才显式暴露待确认项，不把整个内部合同原样展示给用户。
- 兼容接口如 `model/business-summary` 也必须从统一模型视图派生稳定结果，不再单独调用 LLM 生成第二套摘要语义。

## 推荐执行链

1. `00-orchestrator-sop`
2. `01-ontology-mapping`
3. `12-model-snapshot-reconcile`
4. `13-business-entity-structure`
5. `10-business-rule-linking`
6. `02-impact-analysis`
7. `03-deliverable-governance`
8. `06-quality-release-gate`
9. `14-production-delivery-loop`
10. `07-audit-trace`

说明：

- `00-orchestrator-sop` 只负责决策顺序。
- `12-model-snapshot-reconcile` 负责将迭代输入与基线快照对比。
- `13-business-entity-structure` 负责把候选业务实体、关系、能力结构化。
- `10-business-rule-linking` 负责把业务规则挂到工程对象。
- `14-production-delivery-loop` 负责把 `prototype-preview -> technical-architecture -> code-delivery -> test-matrix` 收敛成真实执行 loop，而不是一次性文档生成。
- 该 loop 在运行时必须固化为 `IterationChangeControl.productionDeliveryLoop`，并由 release review、publish gate、coach context 统一消费，避免再次形成重复判断逻辑。

## 统一 skill 输入契约

每个 skill 必须从同一类结构读取数据：

- `project_model_snapshot`
- `baseline_model_snapshot`
- `candidate_changes`
- `project_knowledge_base`
- `iteration_context`
- `user_message`
- `project_model_view`
- `prototype_preview`
- `technical_architecture`
- `code_delivery`
- `test_matrix`

禁止：

- 直接从散落 JSON 结构各自拼字段
- 直接以 chat 历史作为唯一证据
- 没有 evidence 就输出高置信结论
- 在 OpenClaw、coach、前端面板之间重复维护不同版本的项目知识摘要
- 让 `model/business-summary` 继续承担主入口职责；该接口只允许作为兼容层存在，主链路统一读取 `project_model_view`

## 统一 skill 输出契约扩展

在现有统一返回契约基础上增加两个推荐字段：

- `model_updates`
- `review_tasks`

其中：

- `model_updates` 供应用服务写回候选快照
- `review_tasks` 供工作台生成业务确认任务

## 风险

- 如果 skill 输出无法写回正式领域对象，OpenClaw 只能生成说明文本，无法承接长期迭代。
- 如果 orchestrator 直接替代专业 skill 输出，会重新形成提示词黑箱。
- 如果业务确认结果不回写模型层，迭代继承会继续失真。
- 如果代码生成和测试没有进入持续修正 loop，所谓“代码交付”会停留在演示稿，无法支撑生产交付。

## 工程要求

- skills 目录继续保持单职责拆分。
- 每个 skill 文件保持在 1000 行以内。
- 每个 skill 必须配套示例输入输出或契约验证。
- OpenClaw 应通过应用服务访问模型层，不允许直接修改基础存储。
