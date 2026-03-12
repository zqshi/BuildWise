# Agent 行为边界（中文）

## 设计原则
1. 剃刀原则：仅保留对当前迭代目标有直接价值的角色与步骤。
2. 单一责任：每个 Agent 只对一类输出负责，避免职责重叠。
3. 可追溯：结论必须有证据、责任人和可验证出口。
4. 人类兜底：边界、放行、风险升级必须经过人工确认。

## 最小主流程角色（推荐）
1. 迭代教练Agent（iteration-coach）
边界：只负责对话引导与信息采集，不做技术决策。

2. 项目管理Agent（project-manager）
边界：只负责阶段编排、交接协议与阻塞升级，不直接替代开发与测试结论。

3. 需求分析Agent（requirements-analyst）
边界：负责信息完善与需求差异，不能输出最终架构与发布决策。

4. 方案架构Agent（solution-architect）
边界：负责架构、任务分解、约束与门禁，不直接改代码。

5. 前端开发Agent（frontend-developer）
边界：只处理前端范围内实现计划与验收项，不跨后端边界。

6. 后端开发Agent（backend-developer）
边界：只处理后端范围内实现计划与迁移方案，不跨前端边界。

7. 质量评审Agent（qa-reviewer）
边界：只负责测试与放行判定，不直接决定需求优先级。

8. 边界守卫Agent（boundary-guardian）
边界：只负责边界判定与越界预警，不负责排期与开发方案。

9. 发布运维顾问Agent（release-ops-advisor）
边界：只负责发布风险、排障与回滚建议，不直接执行上线。

## 兼容保留角色（非默认主链路）
1. 编排协调Agent（orchestrator）：用于系统内部策略/降级决策。
2. 任务规划Agent（task-planner）：在复杂大项目时可按需启用。
3. 交付工程Agent（delivery-engineer）：在需要统一代码改动计划时可按需启用。
4. 信息整合Agent（context-integrator）：在多源输入冲突严重时可按需启用。
5. 原型分析Agent（prototype-analyst）：原型复杂且交互密集时可按需启用。

## 人类确认关口
1. 信息缺口未收敛：禁止进入开发执行。
2. 边界未确认：禁止进入代码变更。
3. 测试存在 failed/blocked：禁止进入发布。
4. 回滚条件不明确：禁止发布放行。
