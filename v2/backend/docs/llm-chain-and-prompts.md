# LLM 调用链路与 Prompt 体系（BuildWise）

更新时间：2026-03-06

## 1. 目标定义

平台侧目标：

1. 降低从“模糊需求”到“可执行交付”的信息损耗。
2. 保证每次迭代的改动边界可控，不误伤无关功能。
3. 让需求、组件、代码、版本形成可追溯映射。
4. 支持人类确认闸门，避免模型直接驱动高风险发布。

## 2. 调用链路（端到端）

### 阶段 A：输入理解与差异识别

- 触发：上传附件 / 自然语言变更请求。
- Agent：`orchestrator`（调用 `requirements-analyst` 技能语义）。
- 输入：
  - 当前迭代上下文
  - 上一迭代基线
  - 附件摘要或文本
- 输出：
  - 差异矩阵（新增/变更/移除）
  - 风险列表（含 evidence）
  - 澄清问题
- 闸门：进入 `pending-human-confirmation`。

### 阶段 B：流程编排与确认策略

- Agent：`orchestrator`。
- 输入：阶段 A 结果 + 当前状态机。
- 输出：
  - 阶段计划
  - 阻断项
  - 必要人工确认项
- 闸门：
  - 若确认未通过，停在澄清循环。
  - 通过后进入边界收敛与任务规划。

### 阶段 C：任务拆解与边界内计划

- Agent：`orchestrator`（调用 `task-planner` 技能语义）。
- 输入：已确认差异 + 边界。
- 输出：
  - 工作包（owner/priority/dependsOn）
  - criticalPath
  - 每个任务 `inBoundary` 标记
- 闸门：`inBoundary=false` 不得进入执行关键路径。

### 阶段 D：交付执行设计（不越界）

- Agent：`orchestrator`（调用 `delivery-engineer` 技能语义）。
- 输入：任务计划 + 边界。
- 输出：
  - 实施步骤
  - 代码改动计划（path + changeType）
  - 回滚策略
  - 发布门禁
- 闸门：越界需求必须阻断。

### 阶段 E：测试评审与状态流转建议

- Agent：`orchestrator`（调用 `qa-reviewer` 技能语义）。
- 输入：交付计划 + 风险。
- 输出：
  - 测试矩阵
  - 回归关注点
  - 发布判定（pass/block）
  - 推荐状态流转
- 闸门：阻断项未清除不得进入 release。

### 阶段 F：需求-组件-代码三向映射生成

- 触发：阶段 C/D 形成边界与路径计划后自动生成。
- 输入：
  - `boundary.requirementRefs/componentRefs/codePaths`
  - 优先级发现与任务计划
- 输出：
  - `traceabilityMap.requirementToComponent`
  - `traceabilityMap.componentToCode`
  - `traceabilityMap.requirementToCode`
  - `traceabilityMap.coverageScore/gaps`
- 闸门：
  - 若存在 P0 发现且 `codePaths` 为空，发布评审必须为 `block` 或 `caution`。

### 阶段 G：发布前质量评审 + 运维辅助

- Agent：
  - `orchestrator`（调用 `qa-reviewer`/`release-ops-advisor` 技能语义）
- 输入：
  - 代码改动计划、测试矩阵、风险优先级、边界覆盖
- 输出：
  - `releaseReview`：`decision/reason/blockers/releaseGates/rollback/qualitySignals`
  - `opsTriage`：`hypotheses/triageSteps/rollbackSuggestion`
- 闸门：
  - `decision=block` 时阻断发布动作。

### 阶段 H：领域知识抽取与绑定

- 触发：需求分析完成后自动执行。
- 输入：需求条目、附件摘要、边界路径。
- 输出：
  - `domainKnowledge.terms[]`（术语、定义、证据）
  - `domainKnowledge.rules[]`
  - `domainKnowledge.unknowns[]`
- 绑定：
  - 绑定目标包含页面/API/实体/代码路径（当前优先绑定路径，页面/API/实体为空时标记待补齐）。

## 3. Agent+Skills 执行策略

- 固定单编排 Agent：所有场景统一由 `orchestrator` 承载编排与输出。
- 角色语义技能化：`requirements-analyst`、`task-planner`、`delivery-engineer`、`qa-reviewer` 等仅作为技能语义，不作为独立运行时 Agent。
- 风险控制不变：人工确认、边界门禁、发布阻断规则维持原强度。

## 4. Prompt 结构规范

每个 Prompt 文件必须包含：

1. `# system`：角色职责 + 全局约束 + 输出规则。
2. `# user`：插槽变量注入段。

变量集：

- `{{role}}`
- `{{scope}}`
- `{{goal}}`
- `{{context}}`
- `{{expectedOutput}}`

强约束：

1. 输出必须结构化（默认 JSON 契约）。
2. 不确定信息必须显式标记。
3. 不得越界执行（依赖 context 中的边界摘要）。
4. 当上下文来自切片样本时，默认按“部分信息”处理，不得将缺失信息当作否定事实。

## 4.1 大附件切片与上下文预算策略

目标：在上下文窗口不足时，避免请求失败、截断失真和错误扩展。

策略：

1. 前端切片：
   - 文本 <= 4k 字符：`direct`
   - 文本 > 4k 字符：`chunked-head-middle-tail`（分片 + 重叠 + 抽样）
   - 二进制/不可读文本：`binary-no-text`
2. 请求载荷：
   - 发送 `excerpt`（压缩预览）+ `excerptChunks`（最多 6~8 块）+ `excerptDigest` + `excerptStrategy`
3. 后端合并：
   - 统一拼接并限长（硬上限），避免超长 prompt
   - 在 Agent context 中显式注入 `strategy/digest/preview`
4. Agent 约束：
   - 必须把不确定项放入 `unknowns`
   - 缺少证据时只能要求澄清，不能直接推进执行
5. 降级策略：
   - LLM 不可用时直接失败（`/api/iterations/:id/analysis` 返回 `503`），避免 mock/fallback 误导
   - 上下文预算超阈值时进入保守输出模式（并输出降级原因）
6. 自动澄清：
   - 当触发降级或 unknown 信号过多时，自动生成 `clarificationQuestions` 供人工确认
   - 问题会同步写入迭代 `change-control`，确认通过后自动清空
   - 确认接口需要提交已解决问题列表；存在未解决问题时返回 409 阻断确认
   - 每次确认/澄清会持久化 `lastClarificationResolution`（resolved/unresolved）用于审计回溯
   - 支持通过 `change-control/draft` 持久化 IM 勾选草稿，保证多端续接

运行时观测（analysis response `llmContext`）：

1. `strategy` / `digest`：本次附件切片策略与摘要签名
2. `excerptLength` / `chunkCount`：输入规模
3. `promptContextLength` / `agentCount`：发送到 LLM 的上下文体量与本轮编排产物计数（运行态固定单 Agent）
4. `unknownSignalCount`：模型输出中 unknown 信号数量（用于判断是否需要更多澄清）
5. `degraded` / `degradeReason`：是否触发上下文预算降级与原因
6. `clarificationQuestions`：自动生成的澄清问题列表

可配置阈值（环境变量）：

1. `LLM_MAX_EXCERPT_LENGTH`（默认 9000）
2. `LLM_MAX_CHUNK_COUNT`（默认 6）
3. `LLM_MAX_PROMPT_BUDGET`（默认 24000）
4. `LLM_UNKNOWN_SIGNAL_THRESHOLD`（默认 2）

## 5. Prompt 文件与维护位置

- 目录：`v2/backend/prompts`
- 文件：
  - `agent.iteration-coach.v2.md`
  - `agent.orchestrator.v2.md`
  - `agent.boundary-guardian.v2.md`
  - `agent.release-ops-advisor.v2.md`

加载逻辑：

- 代码：`src/application/workspace/workspaceSupport.ts`
- 策略：优先读取 `v2`，缺失时回退 `v1`，再回退默认模板，保证服务可用。
- 迭代教练入口：`POST /api/iterations/:id/agent-chat`（迭代详情页用户对话引导）

## 6. 迭代升级策略（v1 -> v2）

建议每次升级只改一类行为：

1. 提升差异识别精度（requirements-analyst 技能语义）
2. 强化边界约束（task-planner / delivery-engineer 技能语义）
3. 强化发布阻断标准（qa-reviewer 技能语义）

升级流程：

1. 新建 `agent.<role>.v2.md`
2. 小流量灰度
3. 对比关键指标（阻断准确率、返工率、越界改动率）
4. 达标后切主版本

Prompt 优化基线（本次已落实）：

1. 每个角色增加 evidence/unknowns 约束。
2. task/delivery 强制 `inBoundary` 字段，禁止越界关键路径。
3. qa-reviewer 强制 blocker 可验证，禁止“默认通过”。
4. orchestrator 在 `pending-human-confirmation` 必须停留并输出澄清问题。

## 7. 关键质量指标（建议）

1. `clarification_rounds`：平均澄清轮次
2. `boundary_violation_rate`：越界建议率
3. `acceptance_pass_rate`：验收通过率
4. `rollback_trigger_rate`：回滚触发率
5. `traceability_completeness`：需求-组件-代码映射完整度
6. `release_blocker_count`：发布阻断项数量
7. `domain_term_coverage`：领域术语绑定覆盖率
