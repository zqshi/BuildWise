# Agent协作执行模式整合方案（迭代详情）

## 1. 目标
1. 在不增加不必要角色的前提下，形成“可解释、可执行、可追溯”的多Agent协作机制。
2. 统一Agent提示词质量标准，保证输出结构稳定且可用于自动处理。

## 2. 角色策略（剃刀原则）
### 2.1 默认主链路（建议常驻）
1. 迭代教练Agent（用户引导）
2. 项目管理Agent（流程驱动）
3. 需求分析Agent（信息完善+差异识别）
4. 方案架构Agent（架构与任务分解）
5. 前端开发Agent
6. 后端开发Agent
7. 质量评审Agent
8. 边界守卫Agent
9. 发布运维顾问Agent

### 2.2 按需启用（复杂场景再启用）
1. 信息整合Agent
2. 原型分析Agent
3. 任务规划Agent
4. 交付工程Agent
5. 编排协调Agent（系统内部能力）

## 3. 提示词治理标准
1. 每个Agent仅保留 `v2` 提示词，禁止历史版本并行。
2. 目录统一：`v2/backend/agents/prompts/agent.<role>.v2.md`。
3. 质量结构强制包含：
- `# system` / `# user`
- `遵循原则`
- `工作策略`
- `输出要求`
- 明确 `JSON` 输出约束
- 标准变量 `{{goal}} {{scope}} {{context}} {{expectedOutput}}`（迭代教练额外 `{{message}}`）
4. CI脚本 `check:agents` 作为门禁执行。

## 4. 数据来源与实现要点
1. 模式与流程：`analysisReport.agentPlan.strategy/scope/executionLoop/prompts`。
2. 门禁状态：`changeControl.pendingHumanConfirmation`、边界字段、测试矩阵状态。
3. 角色名称与边界：与后端 catalog 保持一致。

## 5. 验收标准
1. 角色边界与协作链路数据结构完整，至少覆盖主链路角色。
2. 门禁状态可反映确认/边界/测试执行结果变化。
3. `check:agents`、前后端 `typecheck/build` 全通过。

## 6. 风险与回退
1. 若某角色输出缺失，系统应降级处理并标记缺失原因。
2. 若新增角色未补提示词，`check:agents` 必须失败阻断。
