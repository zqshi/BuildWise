# OpenClaw Agentic Flow Governance

## 设计目标
- 平台只提供基础设施与约束边界。
- OpenClaw Agent 自主决定会话推进方式与动作顺序。
- 避免前端/后端硬编码固定问答树，提升扩展性。

## 基础设施（平台职责）
1. 状态机流转合法性。
2. 质量与发布门禁。
3. 人工确认强制点。
4. 审计追踪与决策留痕。

## 交互编排（Agent 职责）
1. 根据上下文动态决定下一步（澄清/边界/计划/测试/发布）。
2. 自适应首个版本与后续版本的推进节奏。
3. 选择问题式或选项式交互，不依赖固定模板话术。
4. 输出可执行动作与必要澄清清单。

## 合同化配置
- 文件：`agents/workflows/dynamic/iteration-coach.contract.json`
- 关键字段：
  - `softFlow`: 推荐流程（可重排）
  - `hardConstraints`: 不可违反约束
  - `autonomyHints`: Agent 自主策略提示
  - `expectedArtifacts`: 关键交付物基线

## 实施说明
1. 后端 coach 服务在每轮 prompt context 注入合同配置。
2. prompt 只保留输出契约与最小约束，不再写死流程步骤。
3. 前端不拼接“强制引导 prompt”，直接把用户自然语言交给 Agent。
4. 迭代详情页不再使用右侧固定“自然语言引导/交付物/指标”栏位，推进信息只在会话流中由 Agent 自然语言逐轮给出。
5. 前端不再渲染 `操作建议JSON` 卡片，统一转为会话中的助手消息。

## 文件驱动流程调整
1. 当用户在对话中提交流程文件并提出调整诉求时，Agent 必须优先基于文件上下文提炼流程增量。
2. 仅在主窗口编排对话中输出 `flow_route`，由 Agent 决策：
   - `default-orchestration`：采用默认流程编排
   - `skill-creator`：需要沉淀为新技能，并引入 skill-creator
3. 项目迭代窗口不做该评估，按既定规则执行推进。
4. 平台不替 Agent 做固定判定，只提供最小约束与可追溯提示。

## 迭代内映射与边界
1. 迭代内每次功能点新增、删除、替换，都应触发：
   - `01-ontology-mapping`
   - `02-impact-analysis`
   - 后续版本追加 `04-cross-iteration`
2. 触发入口不限于点选，还包括：
   - 自然语言输入
   - 文档上传
   - HTML 上传
   - 图片上传
   - 历史交付物引用
3. 平台必须保留 `requirementRefs/componentRefs/codePaths` 三向边界。
4. 后续交付物只允许围绕已确认边界推进。
5. 发布门禁必须引用 traceability 覆盖率和边界完整度。
6. 每个项目对应一个独立 workspace，OpenClaw 需要持续沉淀项目级知识，而不是每轮重新理解。
7. 工程本体与业务规则必须分维建模：
   - 工程本体：页面、组件、接口、状态、代码路径
   - 业务规则：术语、约束、条件、例外、验收与合规口径
8. 业务人员应当可以在原型和实现存在之后，通过自然语言继续灌入领域知识，而不依赖研发改代码。
9. 高质量产品研发流程不能只看“交付物是否存在”，还必须检查 UX、原型、代码、测试、发布之间的交接质量。
10. 详细契约见：
   - [iteration-ontology-impact-contract.md](/Users/zqs/Downloads/project/BuildWise/v2/docs/iteration-ontology-impact-contract.md)
   - [agent-skills-product-rd-evaluation.md](/Users/zqs/Downloads/project/BuildWise/v2/docs/agent-skills-product-rd-evaluation.md)
