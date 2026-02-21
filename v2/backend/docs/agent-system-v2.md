# Agent System V2（全局升级版）

## 1. 目标
本方案用于把迭代详情页从“规则回复”升级为“Agent 引导式闭环沟通”，并统一维护 Agent 提示词资产，支持长期演进。

核心目标：
1. 让用户在迭代详情页获得自然、可推进的沟通体验。
2. 将“上传 -> 分析 -> 澄清 -> 边界 -> 计划 -> 验收 -> 发布”串成可追溯闭环。
3. 将提示词全部沉淀为 `.md` 文件，避免散落在代码中。
4. 建立可维护的提示词版本机制（v1/v2）。

## 2. Agent 拓扑

### 2.1 用户侧 Agent
1. `iteration-coach`：对话引导、上传引导、澄清推进、下一步动作建议。

### 2.2 分析与执行 Agent
1. `requirements-analyst`：需求差异、风险、澄清问题。
2. `task-planner`：工作包拆解、依赖、优先级、边界内外分流。
3. `delivery-engineer`：边界内实施计划、路径级变更计划、回滚与门禁。
4. `qa-reviewer`：测试矩阵、阻断项、发布判定。
5. `orchestrator`：全阶段编排与状态推进建议。

### 2.3 治理扩展 Agent（已接入主链路）
1. `boundary-guardian`：边界白名单与越界阻断。
2. `release-ops-advisor`：运行告警归因、排障步骤、回滚建议。

## 3. 提示词维护规范

### 3.1 文件路径
目录：`/Users/zqs/Downloads/project/BuildWise/v2/backend/prompts`

版本命名：
- `agent.<role>.v1.md`：旧版
- `agent.<role>.v2.md`：当前主维护版本

运行时加载策略：
1. 优先加载 `v2`。
2. 若不存在则回退 `v1`。
3. 若解析失败则回退代码内兜底模板。

### 3.2 文件结构（必须）
每个 prompt 文件必须包含：
1. `# system`
2. `# user`

`# system` 必须包含：
1. 角色定位
2. 核心任务
3. 约束规则
4. 禁止事项
5. 输出格式

`# user` 必须包含变量占位：
- `{{goal}}`
- `{{scope}}`
- `{{context}}`
- `{{expectedOutput}}`

`iteration-coach` 额外包含：
- `{{message}}`

### 3.3 提示词质量检查（已接入）
命令：
1. `npm run check:prompts`
2. `npm run check:prompts:replay`

检查项：
1. `v2` prompt 文件存在性
2. `# system / # user` 结构完整性
3. 必需变量占位符完整性
4. 输出 JSON 约束声明
5. 样例渲染后无未替换变量

`verify:prod-readiness` 已接入 `check:prompts` + `check:prompts:replay`，作为发布前门禁的一部分。

## 4. 迭代详情页链路

1. 用户发送消息 -> `/api/iterations/:id/agent-chat`
2. `iteration-coach` 基于迭代上下文输出自然回复 + 引导动作
3. 用户上传附件 -> `/api/iterations/:id/analysis`
4. 多 Agent 分析输出差异/风险/测试矩阵
5. 人工确认与边界收敛 -> `/change-control/confirm|boundary|draft`
6. 后续交付与验收流程在同一上下文推进
7. 运维辅助步骤可直接在详情页复制（步骤/期望信号/失败回退/命令模板），用于值班与故障处置。

## 5. 治理指标（建议纳入看板）
1. `coach_upload_conversion_rate`：引导后上传转化率
2. `clarification_rounds_avg`：平均澄清轮次
3. `clarification_resolution_rate`：澄清问题收敛率
4. `boundary_confirm_cycle_time`：边界确认耗时
5. `analysis_to_plan_latency`：分析到计划的耗时
6. `release_blocker_clearance_time`：发布阻断清理耗时

## 6. 演进建议

### P0
1. 迭代详情页全面替换规则回复，统一走 `agent-chat`。
2. 接入 change-control 确认与边界编辑交互。
3. 用 `v2` prompt 统一线上策略。

### P1
1. 增加 prompt JSON schema 校验与离线测试样例。
2. 增加 prompt A/B 对照与质量回归基线。
3. 增加对话质量指标采集。

### P2
1. 增加领域术语到页面/API/实体的自动绑定精度（当前优先 codePath 绑定）。
2. 建立跨项目的 Agent 策略模板库。
3. 增加质量评审结果与发布流水线联动（自动阻断/自动回滚演练）。
