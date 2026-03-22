# Agentic Flow Mock Dataset

## 用途
这份 mock 数据契约只演示两类真实业务场景：

1. `V1`：首版本从 0 到 1 建立业务基线。
2. `V1.1`：后续版本基于 `V1` 做增量变更，并在测试阻断后发生局部回滚。

它不再把主窗口流程协商、`flow_route`、`skill-creator` 语义混入迭代详情页数据。

## 生成方式
在 `v2` 目录执行：

```bash
npm run seed:agentic:flow
```

脚本会同时写入：
- `v2/backend/data.json`
- `v2/backend/data.runtime.json`

## 契约原则
1. 首版本不出现任何继承语义。
2. 后续版本必须显式继承 `V1` 基线。
3. 后续版本只处理增量，不重做首版全部交付物语义。
4. 每个阶段交付物必须与阶段语义一致。
5. 用户调整交付物通过对话完成，抽屉只负责预览。
6. 阻断、回滚、恢复推进必须有消息、交付物、快照、状态迁移四类证据同时存在。
7. 支撑性交付物不能缺失：PRD、设计规范、技术架构必须在需要时真实存在，并能指导后续环节工作。

## V1 契约
版本：`1.0.0`

1. 场景：首版建立线索协同看板基线。
2. 交付物顺序：
   - `analysis-report`
   - `product-requirements-doc`
   - `boundary-confirmation`
   - `prototype-preview`
   - `design-spec`
   - `technical-architecture`
   - `code-delivery`
   - `test-matrix`
   - `release-review`
   - `delivery-package`
3. 状态迁移：
   - `planned -> in-progress`
   - `in-progress -> review`
   - `review -> completed`
4. 禁止词：
   - `继承差异`
   - `历史版本分析报告`
   - `flow_route`
   - `skill-creator`

## V1.1 契约
版本：`1.1.0`

1. 场景：基于 `V1` 新增导出与 `@提醒`。
2. 必须包含：
   - 继承 `V1` 基线的开场消息
   - `继承差异分析报告`
   - 增量 `PRD`
   - 导出入口局部原型更新
   - 与原型配套的设计规范
   - 说明导出链路与通知链路边界的技术架构
   - `@提醒` 导致测试阻断
   - 发布评审 `BLOCK`
   - 回滚 `@提醒`
   - 回滚后边界收敛为“仅保留导出”
3. 状态迁移：
   - `planned -> in-progress`
   - `in-progress -> review`
   - `review -> in-progress`
4. 禁止词：
   - `flow_route`
   - `skill-creator`

## 数据校验
自动测试文件：
- [agenticFlowMockSeed.test.ts](../tests/agenticFlowMockSeed.test.ts)

执行：

```bash
npm test -- tests/agenticFlowMockSeed.test.ts
```

## 额外说明
项目级 `Agent + skills` 协作证据仍然保留在：
- `projectPolicies`
- `policyExecutionLogs`

但这些证据现在只描述“如何推进业务交付”，不再描述主窗口流程路由判断。

当前技能包还新增了 `09-deliverable-content-contract`，用于约束以下内容必须可执行、可指导下游工作，而不是占位文本：
- 产品需求文档（PRD）
- UI 样式与设计规范
- 技术架构说明
- 代码交付说明
- 测试矩阵
- 发布评审与归档基线
