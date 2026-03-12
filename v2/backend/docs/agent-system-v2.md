# Agent System V2（全局升级版）

## 1. 目标
本方案用于把迭代详情页从“规则回复”升级为“Agent 引导式闭环沟通”，并统一维护 Agent 提示词资产，支持长期演进。

核心目标：
1. 让用户在迭代详情页获得自然、可推进的沟通体验。
2. 将“上传 -> 分析 -> 澄清 -> 边界 -> 计划 -> 验收 -> 发布”串成可追溯闭环。
3. 将提示词全部沉淀为 `.md` 文件，避免散落在代码中。
4. 建立可维护的提示词版本机制（v1/v2）。

## 1.1 角色收敛原则（剃刀原理）
1. 仅启用完成当前迭代目标所需的最小角色集合。
2. 运行态固定为单编排 Agent（`orchestrator`）；其余角色仅作为技能语义标签，不作为独立 Agent 进程调度。
3. `context-integrator`、`prototype-analyst`、`task-planner`、`delivery-engineer` 等角色语义用于输出结构化分工，不代表多 Agent 切换。
4. 人工确认门禁优先于自动流转：边界未确认、测试阻塞未清理、回滚条件不明确时禁止放行。

### 1.2 Agent+Skills 模式
1. BuildWise 已固定采用 `Agent + Skills` 单编排路线，不再保留多 Agent 切换机制。
2. `buildIterationAgentPlan` 统一输出单编排 Agent（`orchestrator`）Prompt，由其驱动技能链完成研发闭环。
3. 不变项：结构化 Prompt 契约、输出 JSON 约束、质量门禁与边界校验仍必须保留。
4. 技能包默认来源：`v2/backend/skills/claude-arsenal/skills`。

## 2. Agent 拓扑

### 2.1 用户侧 Agent
1. `iteration-coach`：对话引导、上传引导、澄清推进、下一步动作建议。
2. `orchestrator`：单编排 Agent，驱动阶段流转、技能调用、升级与交接门禁。

### 2.2 分析与执行 Agent
1. `context-integrator`：技能语义，表示文档/原型/历史上下文融合能力。
2. `prototype-analyst`：技能语义，表示原型交互解析与状态建模能力。
3. `solution-architect`：技能语义，表示架构决策与技术门禁能力。
4. `requirements-analyst`：技能语义，表示需求差异、风险、澄清能力。
5. `task-planner`：技能语义，表示工作包拆解与依赖规划能力。
6. `frontend-developer`：技能语义，表示前端实现计划与UI验收能力。
7. `backend-developer`：技能语义，表示后端实现计划、接口与数据策略能力。
8. `delivery-engineer`：技能语义，表示实施步骤、回滚与放行门禁能力。
9. `qa-reviewer`：技能语义，表示测试矩阵、阻断项、发布判定能力。

### 2.3 治理扩展 Agent（已接入主链路）
1. `boundary-guardian`：边界白名单与越界阻断。
2. `release-ops-advisor`：运行告警归因、排障步骤、回滚建议。

## 3. 提示词维护规范

### 3.1 文件路径
目录（推荐统一入口）：`v2/backend/agents/`

标准子目录：
1. `catalog/`：Agent 清单与职责契约。
2. `prompts/`：Agent 提示词模板。
3. `workflows/fixed/`：固定工作流模板。
4. `workflows/dynamic/`：动态工作流提示。
5. `function-prompts/`：功能提示词（可复用能力模块）。
6. `adapters/`：外部生态适配（如 Agent Scope）。

兼容目录（历史保留）：`v2/backend/prompts`

版本命名：
- `agent.<role>.v1.md`：旧版
- `agent.<role>.v2.md`：当前主维护版本

运行时加载策略：
1. 优先加载 `v2/backend/agents/prompts/agent.<role>.v2.md`。
2. 若不存在则回退历史目录 `v2/backend/prompts`。
3. 运行态只生成 `orchestrator` Prompt，其它角色 Prompt 仅作历史兼容与离线资产复用。
4. 若解析失败则回退代码内兜底模板。

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
3. 用户上传附件（文档/原型） -> `/api/iterations/:id/analysis`
4. `orchestrator` 调用技能链完成信息完善（含 `context-integrator`/`prototype-analyst` 等语义能力）
5. 单编排 Agent 输出差异/风险/测试矩阵与交付计划
6. 人工确认与边界收敛 -> `/change-control/confirm|boundary|draft`
7. 后续交付与验收流程在同一上下文推进
8. 运维辅助步骤可直接在详情页复制（步骤/期望信号/失败回退/命令模板），用于值班与故障处置。

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

## 7. 对话化交付物治理（新增约束）

1. 管理员确认走对话窗口通知：当交付物被 `blocked` 或阶段流转被上游门禁阻断时，系统自动发送 `【管理员确认请求】` 系统消息，不再生成独立冲突包。
2. 阶段推进自动插入交付物引用卡：每个阶段进入时按交付物生成 `【交付物引用】` 消息，包含 `类型/阶段/状态/摘要/证据`，用于会话内继续执行。
3. 交付物详情按类型渲染：文档、HTML 原型、代码、测试用例、发布评审、归档文件采用差异化展示。
4. 用户可在交付物抽屉完成 `draft -> commit -> confirm`，并一键发送引用卡或触发“继续执行”对话指令。
