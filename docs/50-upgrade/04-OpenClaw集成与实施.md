# 04 OpenClaw 集成与实施

## 1. 集成原则

本轮不改 OpenClaw 既有逻辑和机制，只复用其现有能力：

1. `agent`
2. `session key`
3. `workspace`
4. `skills`
5. `history`

BuildWise 侧只做：

1. 项目绑定。
2. 项目知识物化。
3. 检索与上下文注入。
4. 定时汇总。

## 2. session key 约定

1. 主窗口：
   - `agent:<agentId>:global-<conversationId>`
2. 项目级：
   - `agent:<agentId>:project-<projectId>`
3. 迭代级：
   - `agent:<agentId>:project-<projectId>-iteration-<iterationId>`

判断原则：

1. 新建项目应形成新的项目级 session 命名空间。
2. 新建迭代应形成新的迭代级 session 命名空间。
3. 迭代知识仍回写项目知识库，不形成知识孤岛。

## 3. workspace binding

每个项目一条 binding，包含：

1. `projectId`
2. `openclawProfile`
3. `agentId`
4. `workspacePath`
5. `runtimeMode`

要求：

1. `workspacePath` 与项目一一对应。
2. 所有迭代共享该项目 workspace。
3. 不为每个项目创建新的 Agent。

## 4. 分阶段实施

### Phase 1

1. 修复运行时语义问题。
2. 同步配置、README、门禁。
3. 为项目 workspace 增加知识物化与检索。

### Phase 2

1. 收敛策略与 skills 注入链路。
2. 强化项目知识回写与读取。
3. 增加每日 0 点汇总任务。

### Phase 3

1. 清理冗余文档与脚本。
2. 重新跑绿质量门禁。
3. 形成投产基线。

## 5. 风险

1. 工作区当前存在大量未提交改动。
2. 运行时语义修复可能影响已有测试预期。
3. 设计文档与实际实现必须同步更新，否则治理会再次失真。
