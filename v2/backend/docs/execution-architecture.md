# BuildWise 执行架构：Agent + Skills

> 本文档从代码实现中提取，描述 BuildWise 的 Agent 执行模型、Skills 治理链、LLM 调用链路及全流程编排。
> 源码基线：2026-03-27

---

## 一、架构总览

BuildWise 采用 **单 Agent + Skills 链式编排** 模式：

- **单 Agent**：统一的 `AgentRunner` 接口，所有 LLM 调用通过同一实例发起
- **15 个治理 Skills**：以 SOP（标准操作流程）文档形式定义，按阶段动态选择后注入 Agent prompt
- **不是多 Agent**：代码中的 `agent-project-manager-1`、`agent-requirements-analyst-compact-1` 等是 prompt 角色模板，不是独立运行的 Agent 实例

```
┌──────────────────────────────────────────────────────────────┐
│                     BuildWise 执行层                          │
│                                                              │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │ Coach 对话  │   │  分析流水线   │   │  全周期一键执行   │   │
│  └─────┬──────┘   └──────┬───────┘   └────────┬─────────┘   │
│        │                 │                     │             │
│        ▼                 ▼                     ▼             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Skill Chain 编排层                        │   │
│  │  skillRegistry → selectSkills → skillInjector         │   │
│  │  (三源合并)       (四层选择)      (SOP 注入 prompt)    │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              AgentRunner (统一 LLM 接口)               │   │
│  │  run(prompt) / runWithHistory(system, messages)        │   │
│  └──────────────────────┬───────────────────────────────┘   │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐
     │ OpenClaw  │  │  OpenAI  │  │Anthropic │
     │ Gateway   │  │ Compatible│  │Compatible│
     │ (会话持久) │  │(DeepSeek等)│  │          │
     └──────────┘  └──────────┘  └──────────┘
```

---

## 二、AgentRunner — 统一 LLM 接口

### 接口定义

```typescript
// domain/shared/agentRunner.ts
interface AgentRunner {
  run(prompt: IterationAgentPrompt, options?: AgentRunOptions): Promise<AgentRunResult>;
  runWithHistory(systemPrompt: string, messages: ConversationMessage[], options?: AgentRunOptions): Promise<AgentRunResult>;
}
```

所有 LLM 调用都是 **prompt-in / text-out**，没有 function-calling 或 tool-use。Skills 的 SOP 内容作为 prompt 文本注入，Agent 在 SOP 指导下执行。

### 三个 Provider 实现

| Provider | 实现类 | 选择条件 | 特殊能力 |
|----------|--------|----------|----------|
| OpenClaw Gateway | `OpenClawAgentRunner` | `LLM_PROVIDER=openclaw` | 会话持久化（`X-OpenClaw-Session-Key`）、Agent 路由（`X-OpenClaw-Agent-Id`） |
| OpenAI Compatible | `OpenAICompatibleAgentRunner` | `LLM_PROVIDER=openai`（默认） | 兼容 DeepSeek、Moonshot 等 |
| Anthropic Compatible | `AnthropicCompatibleAgentRunner` | `LLM_PROVIDER=anthropic-compatible` | Anthropic Messages API 格式 |

Provider 选择由 `agentRunnerFactory.ts` 的 `createAgentRunnerFromEnv()` 根据环境变量决定。OpenAI/Anthropic 实现自带单次重试（5xx/网络错误），OpenClaw 不重试（由 Gateway 自身处理）。

### 续写引擎

```
agentContinuation.ts — runWithContinuation()
│
├─ agentRunner.run(prompt)           ← 首次调用
│   └─ 若 truncated:
│       ├─ agentRunner.runWithHistory(system, [...messages, continuation_instruction])
│       ├─ mergeChunks() — 200 字符重叠检测去重
│       └─ 最多续写 maxContinuations 次（Coach=2, 分析=3）
│
└─ 返回 ContinuationResult { content, continuations, complete }
```

---

## 三、Skills 体系 — 15 个治理技能

### 技能清单

```
skills/buildwise-openclaw/
├── 00-orchestrator-sop          # 主编排：阶段路由、门禁执行
├── 01-ontology-mapping          # 领域本体建模与映射
├── 02-impact-analysis           # 变更影响分析
├── 03-deliverable-governance    # 交付物生命周期治理
├── 04-cross-iteration           # 跨迭代继承
├── 05-exception-recovery        # 异常恢复
├── 06-quality-release-gate      # 质量与发布门禁
├── 07-audit-trace               # 审计追踪
├── 08-agentic-flow-contract     # Agent 交互契约
├── 09-deliverable-content-contract  # 交付物内容完整性契约
├── 10-business-rule-linking     # 业务规则→工程本体链接
├── 11-product-rd-quality-contract   # 跨阶段质量契约(UX/代码/测试/发布)
├── 12-model-snapshot-reconcile  # 模型快照对账
├── 13-business-entity-structure # 业务实体结构
├── 14-production-delivery-loop  # 生产交付循环
```

每个 Skill 包含：
- `SKILL.md` — YAML frontmatter（name, description）+ SOP 正文（Goal / Inputs / Outputs / SOP 步骤）
- `agents/openai.yaml` — OpenClaw 接口定义（display_name, short_description, default_prompt）

### 链式编排配置

```json
// skills/buildwise-openclaw/skill-chain.json
{
  "runtime": "openclaw+bridge",
  "orchestrator": "00-orchestrator-sop",
  "sequence": [
    "00-orchestrator-sop", "01-ontology-mapping", "10-business-rule-linking",
    "02-impact-analysis", "03-deliverable-governance", "04-cross-iteration",
    "09-deliverable-content-contract", "11-product-rd-quality-contract",
    "05-exception-recovery", "06-quality-release-gate", "07-audit-trace"
  ],
  "contracts": {
    "schema": "contract.schema.json",
    "requiredFields": ["status","summary","artifacts","questions","risks","next_actions","evidence"]
  }
}
```

### 三源合并注册表

`skillRegistry.ts` 将三个数据源合并为统一的 `UnifiedSkillEntry[]`：

```
数据源                   优先级        说明
─────────────────────────────────────────────────────
File Pack (SKILL.md)     最低         从 skill-chain.json 加载，读取 SOP 正文
Global Custom Skills     覆盖同 ID    用户自定义技能（openclaw-global.json），仅 active 的
Policy Skills Plan       白名单过滤   项目编排策略的 skillsPlan，缩小可用范围
```

### 四层动态选择

`workspaceOpenclawSkillsBridge.ts` → `selectOpenclawSkillsFromRegistry()`:

```
Layer 1: 策略 stageSkillMap        ← 项目编排策略直接指定某阶段用哪些技能（最高优先）
Layer 2: 阶段默认映射              ← 当 Layer 1 无结果时，按 activeStage 硬编码匹配
Layer 3: 关键词信号（叠加）        ← 用户消息关键词 + 知识库命中/冲突 → 补充业务规则/质量技能
Layer 4: 兜底                      ← 上述全无匹配时，保底选择 00-orchestrator-sop
```

**阶段默认映射表：**

| 阶段 | 默认技能 |
|------|----------|
| clarification | 00-orchestrator-sop, 01-ontology-mapping |
| scope | 02-impact-analysis, 03-deliverable-governance, 04-cross-iteration |
| interaction / development | 09-deliverable-content-contract, 08-agentic-flow-contract, 05-exception-recovery |
| testing | 06-quality-release-gate, 11-product-rd-quality-contract |
| release | 07-audit-trace, 06-quality-release-gate |
| archive | 07-audit-trace |

### SOP 注入机制

`skillInjector.ts` → `buildSkillPromptInjection()`:

- 最多注入 **3 个 Skills**
- 总预算 **8000 字符**
- 格式：`[SKILL: <id>] <name>\n<SOP 正文（截断至预算）>`
- 注入到 Agent 的 system prompt 中

---

## 四、Coach 对话执行链路

### 完整数据流

```
coachIterationConversationOp (workspaceServiceCoachOps.ts)
│
├─ 1. 加载状态
│     findIteration → normalizeIteration → findPreviousIteration
│     listMessages(-8) → parseRecentSuggestedActions → inferIntent
│
├─ 2. 前置门控（可能直接返回，不调 LLM）
│     ├─ handleCoachPeriodicRepositorySync   ← 周期性仓库同步
│     ├─ handlePendingGitRequirementIntake    ← Git 需求采集
│     └─ evaluatePolicyGateForCoachOp         ← 策略门禁拦截
│
├─ 3. Skill Chain 执行（同步，不调 LLM）
│     runOpenclawSkillChainForCoach({iteration, project, previousIterationName, userMessage})
│     ├─ buildRegistry()                    ← 三源合并
│     ├─ extractSelectionParams()           ← 从迭代/项目提取上下文
│     ├─ selectOpenclawSkillsFromRegistry() ← 四层选择
│     └─ 返回 { selectedSkills, suggestedActions, checklist, risks, evidence }
│
├─ 4. 上下文组装
│     buildCoachContext(iteration, previous, project, userMessage)
│     ├─ 迭代状态 + 进度 + 前版名称
│     ├─ buildInheritedBaselineContext()     ← 前版已交付物摘要
│     ├─ 范围（inScope / outOfScope / acceptanceCriteria）
│     ├─ 分析状态（lastAnalysisAt / pendingConfirmation / 澄清问题）
│     ├─ 变更边界（requirementRefs）
│     ├─ summarizeProjectKnowledge()        ← 项目知识库摘要
│     ├─ summarizeChangeIntelligence()      ← 变更智能摘要
│     ├─ buildOpenclawSkillSelectionContext()← Skills SOP 注入（核心）
│     │     ├─ 选择技能
│     │     └─ buildSkillPromptInjection()  ← 最多 3 个 SOP，8000 字符
│     ├─ buildCoachContractContext()         ← 引导阶段 + 沟通原则 + 约束
│     └─ buildArtifactUpstreamContextForCoach() ← 上游交付物上下文
│
├─ 5. Prompt 构造
│     agentId: "agent-iteration-coach-1"
│     role: "iteration-coach"
│     renderTemplate(systemPrompt, {role, scope, goal, context})
│     renderTemplate(userPrompt, {message, context})
│
├─ 6. LLM 调用
│     runWithContinuation(agentRunner, prompt, {sessionContext}, {maxContinuations: 2})
│
├─ 7. 响应解析
│     extractCoachMarker(content)  ← 提取 <!-- coach:{...} -->
│     解析 intent / execution / guidance
│
├─ 8. 合并 Skill Chain 结果
│     LLM 返回的 suggestedActions 为空时 → 用 skillChain.suggestedActions 兜底
│     mergedActions = LLM actions + skill actions（去重）
│     mergedChecklist = LLM checklist + skillChain.checklist（去重，最多 8 条）
│
└─ 9. 返回 IterationCoachChatResponse
      { iterationId, intent, reply, execution, guidance, llm }
```

### Coach 输出格式

Agent 被指示先用自然语言回复用户，最后一行附带隐藏标记：

```
退款功能确实需要做，不过我建议我们先聊清楚几个关键点...

<!-- coach:{"intent":"clarify","execution":{"action":"none"},"guidance":{"suggestedActions":["确认退款触发条件"]}} -->
```

---

## 五、分析流水线执行链路

### 10 阶段管线

`analyzeAttachmentOp` (workspaceServiceAnalysisOps.ts) 执行 10 个有序阶段：

```
阶段                              LLM 调用    并行性        产出
─────────────────────────────────────────────────────────────────────
1. preflight:folder-selection     0-1 次      串行          文件选择决策
2. preflight:execution-policy     0-1 次      串行          执行策略(降级/并行度)
3. analysis:agent-plan            0-N 次      分组并行(2-6) Agent 输出(按角色)
4. synthesis:attachment-insights  0-1 次      串行          附件元数据洞察
5. synthesis:project-profile      1-5+ 次     串行(含修复)  项目检测 + 发现 + 优先级
6. synthesis:project-profile-batches 0-N×5    全并行        补充批次合成(大文件拆分)
7. synthesis:deep-business-governance          深度洞察/业务确认/治理洞察
   ├─ deep-insights               1 次       ┐
   ├─ business-confirmation       1 次       ├ 三者并行
   └─ governance-insights         1 次       ┘
8. synthesis:report-quality       1 次        串行          报告质量评分
9. synthesis:release-review       1 次        串行          发布评审决策
10. finalize:report               0 次        串行          数据组装 + 持久化
```

**单次完整分析约 8-15+ 次 LLM 调用**，取决于文件数量、批次、修复重试。

### 阶段 3 详细：Agent Plan 执行

```
buildIterationAgentPlan()
├─ strategy: 始终 "single-agent"
├─ 紧凑单文件模式 → agentId: "agent-requirements-analyst-compact-1"
└─ 完整模式 → agentId: "agent-project-manager-1"

executeAgentPlanPromptsOp()
├─ 读取 LLM_PLAN_PARALLELISM（默认 2，最大 6）
├─ 按 parallelism 分组，每组 Promise.all 并行
└─ 每个 prompt 含: vision payloads（图片）、skill pack hint、agent scope adapter hint
```

### 阶段 7 详细：三路并行合成

| 函数 | Agent ID | 产出 |
|------|----------|------|
| `synthesizeDeepInsightsOp` | `agent-deep-insights-1` | 逐文件洞察、跨文件主题/冲突/差距/根因 |
| `synthesizeBusinessConfirmationOp` | `agent-business-confirmation-1` | 核心意图、成功标准、交互洞察、必须做/应该做/可延迟/排除 |
| `synthesizeGovernanceInsightsOp` | `agent-governance-insights-1` | 版本差异详情、追溯映射、可执行约束、领域知识 |

### 修复与降级机制

每个合成步骤都有修复循环：
1. 首次调用 → 解析 JSON → 检查必填字段
2. 缺失字段 → 生成修复 prompt（含错误信息）→ 重试（最多 2 次）
3. 项目 Profile 支持模型轮换（`fallbackModels` 数组，逐次切换模型）

---

## 六、全周期一键执行

### 9 步流水线

`runIterationFullCycleOp` (workspaceServiceFullCycleOps.ts):

```
步骤                        函数                              LLM?   可跳过
─────────────────────────────────────────────────────────────────────────
1. 分析                     analyzeAttachmentOp               是     runAnalysis=false
2. 确认                     confirmIterationAnalysisOp        否     -
3. UX 指导                  generateUxExecutionGuidanceOp     是     -
4. 指令组装                 (纯数据转换)                      否     -
5. 前端改写                 rewriteCodeInBoundaryOp           是     -
   │                        role="frontend-developer"
6. 后端改写                 rewriteCodeInBoundaryOp           是     -
   │                        role="backend-developer"
7. 合并 & 边界检查          mergeRewriteResults               否     -
8. 测试生成                 generateIterationTestArtifacts    是     -
9. 终结化
   ├─ 发布评审              getIterationReleaseReview         否     -
   ├─ 交付归档              generateIterationDeliveryPackage  是     -
   └─ 推送远端              publishIterationToRemote          否     dryRun
```

### 代码改写细节

```
rewriteCodeInBoundaryOp
├─ 解析边界：boundary.codePaths + allowedExtensions(.ts,.tsx,.js,.jsx,.json,.md,.css,.scss)
├─ git ls-files 枚举候选文件
├─ filterCandidatesByRole：
│   ├─ frontend-developer: .tsx/.jsx/.css/.scss + frontend/web/ui/pages/components 路径
│   └─ backend-developer: .sql/.prisma + backend/server/api/controllers/routes 路径
├─ 读取每个候选文件前 1800 字符
├─ 注入项目模型视图（可选）
├─ LLM 调用 → 返回 {summary, warnings, edits:[{path, reason, content}]}
├─ 逐条验证 edit：
│   ├─ 路径是否在候选集？
│   ├─ assertBoundaryWhitelist — 是否在白名单？
│   └─ 内容是否有变化？
└─ 非 dryRun → writeFileSync 写入磁盘
```

---

## 七、交付物依赖图

### 15 个交付物的上游依赖

```
交付物                       上游依赖
────────────────────────────────────────────────────────────
analysis-report              (无)
product-requirements-doc     analysis-report
boundary-confirmation        analysis-report, product-requirements-doc
prototype-preview            product-requirements-doc, boundary-confirmation
design-spec                  product-requirements-doc, boundary-confirmation, prototype-preview
technical-architecture       product-requirements-doc, boundary-confirmation, design-spec
api-specification            technical-architecture, product-requirements-doc
database-design              technical-architecture, api-specification
frontend-code                technical-architecture, design-spec, prototype-preview, api-specification
backend-code                 technical-architecture, api-specification, database-design
test-matrix                  product-requirements-doc, api-specification, frontend-code, backend-code
acceptance-checklist         product-requirements-doc, test-matrix
release-review               acceptance-checklist, test-matrix, frontend-code, backend-code
deployment-plan              technical-architecture, frontend-code, backend-code, release-review
delivery-package             release-review, deployment-plan, acceptance-checklist
```

### 上游摘要注入

`buildUpstreamExcerpts()` 为目标交付物提取已提交（`outputVersion > 0`）的上游内容：
- 依赖 < 6 个：每个分配 `min(4000, max(800, 8000/count))` 字符预算，提取标题 + 正文
- 依赖 >= 6 个：仅用 summary 前 220 字符
- 注入格式：`### 上游交付物：{title}\n{excerpt}`

### 交付物操作链

```
saveArtifactDraft     → draft.content 写入（最大 256000 字符）
commitArtifact        → outputVersion += 1, gateStatus = "pending"
                        markDownstreamStale() → 下游交付物标记过期
                        publishArtifactReferenceMessage() → 对话流注入引用
confirmArtifact       → gateStatus = "passed" / "blocked"
transitionStage       → 门禁检查：当前阶段所有交付物必须
                        gateStatus=passed + stale=false + outputVersion>0
                        通过后 activeStage 推进到下一阶段
```

---

## 八、OpenClaw 集成

### 角色定位

OpenClaw 是**可选的 LLM 网关代理**，提供两个核心能力：

| 能力 | 实现方式 | 作用 |
|------|----------|------|
| 会话持久化 | `X-OpenClaw-Session-Key` 头 | Gateway 侧维护多轮对话上下文 |
| Agent 路由 | `X-OpenClaw-Agent-Id` 头 | 请求路由到不同后端模型/配置 |

### Session Key 派生策略

```
优先级 1: iterationId + projectId → "agent:{agentId}:project-{pid}-iteration-{iid}"
优先级 2: projectId only          → "agent:{agentId}:project-{pid}"
优先级 3: conversationId          → "agent:{agentId}:global-{cid}"
优先级 4: prompt pattern          → "agent:{agentId}:{prompt.agentId}"
兜底:     空字符串（无会话）
```

### HTTP 调用

```
POST {OPENCLAW_GATEWAY_URL}/v1/chat/completions
Headers:
  Content-Type: application/json
  X-OpenClaw-Agent-Id: {agentId}
  X-OpenClaw-Session-Key: {sessionKey}
  Authorization: Bearer {token}  (可选)
Body:
  { model: "openclaw/{agentId}", stream: false, messages: [...] }
```

返回 OpenAI-compatible 格式，从 `choices[0].message.content` 提取文本。

---

## 九、14 个 Agent 角色模板

```
agents/prompts/
├── agent.iteration-coach.v2.md      # 迭代教练 — Coach 对话主 Agent
├── agent.orchestrator.v2.md         # 编排者 — 分析流水线主控
├── agent.project-manager.v2.md      # 项目经理 — 全周期 Agent Plan
├── agent.requirements-analyst.v2.md # 需求分析师 — 紧凑单文件分析
├── agent.solution-architect.v2.md   # 方案架构师
├── agent.boundary-guardian.v2.md    # 边界守卫
├── agent.frontend-developer.v2.md   # 前端开发 — 代码改写
├── agent.backend-developer.v2.md    # 后端开发 — 代码改写
├── agent.ux-designer.v2.md          # UX 设计师 — UX 指导 + 视觉编辑
├── agent.prototype-analyst.v2.md    # 原型分析师
├── agent.qa-reviewer.v2.md          # QA 评审
├── agent.delivery-engineer.v2.md    # 交付工程师
├── agent.release-ops-advisor.v2.md  # 发布运维顾问
├── agent.context-integrator.v2.md   # 上下文集成器
└── agent.task-planner.v2.md         # 任务规划师
```

这些不是独立运行的 Agent，而是 **prompt 角色模板**。每次 LLM 调用通过 `agentId` 选择对应模板，注入到 system prompt 中。同一个 `AgentRunner` 实例在不同调用中扮演不同角色。

---

## 十、分析队列与并发控制

### 队列模型

```
workspaceServiceAnalysisQueueOps.ts

createQueuedAnalysisJobOp → 创建 status="queued" 的 job
triggerAnalysisQueueOp    → 按 concurrency 限制从队列取 job 执行
reconcileAnalysisJobsOp   → 超时清理：queued 超时 / running 超时 → failed
```

### 批次处理

```
runAttachmentAnalysisJobOp (workspaceServiceAnalysisRunnerOps.ts)
├─ splitAttachmentInputIntoBatches → 按大小拆分
├─ 逐批次串行执行 analyzeAttachmentOp
├─ 每批次失败 → 重试 analysisBatchRetryLimit 次
├─ mergeAttachmentReports → 合并批次报告
└─ 外层 runAttachmentAnalysisJobWithTimeoutOp → 整体超时保护
```

### LLM 调用追踪

AgentRunner 被包装为追踪版本，记录：
- `llmCallCount`: 总 LLM 调用次数
- `llmInFlightCount`: 当前并行调用数
- `llmSuccessCount` / `llmFailureCount`: 成功/失败计数

---

## 十一、关键源码索引

| 模块 | 文件 | 核心函数 |
|------|------|----------|
| AgentRunner 接口 | `domain/shared/agentRunner.ts` | `AgentRunner`, `GatewayCapableRunner` |
| Runner 工厂 | `infrastructure/llm/agentRunnerFactory.ts` | `createAgentRunnerFromEnv` |
| OpenClaw Runner | `infrastructure/openclaw/openclawAgentRunner.ts` | `OpenClawAgentRunner` |
| OpenClaw 客户端 | `infrastructure/openclaw/openclawGatewayClient.ts` | `OpenClawGatewayClient.chat` |
| 续写引擎 | `application/workspace/agentContinuation.ts` | `runWithContinuation` |
| Skill 注册表 | `application/workspace/skillRegistry.ts` | `loadFilePackSkillsWithSop`, `buildUnifiedSkillRegistryOp` |
| Skill 选择与桥接 | `application/workspace/workspaceOpenclawSkillsBridge.ts` | `selectOpenclawSkillsFromRegistry`, `runOpenclawSkillChainForCoach` |
| Skill SOP 注入 | `application/workspace/skillInjector.ts` | `buildSkillPromptInjection` |
| Coach 对话 | `application/workspace/workspaceServiceCoachOps.ts` | `coachIterationConversationOp`, `buildCoachContext` |
| Coach 契约 | `application/workspace/workspaceCoachInteractionContract.ts` | `buildCoachContractContext` |
| Agent Plan 构建 | `application/workspace/workspaceSupportAgent.ts` | `buildIterationAgentPlan` |
| 分析流水线 | `application/workspace/workspaceServiceAnalysisOps.ts` | `analyzeAttachmentOp` |
| 分析预检 | `application/workspace/workspaceServiceAnalysisPreflightOps.ts` | `synthesizeFolderSelectionOp`, `synthesizeExecutionPolicyOp` |
| 分析合成 | `application/workspace/workspaceServiceAnalysisSynthesisTaskOps.ts` | `synthesizeProjectProfileOp` |
| 深度洞察 | `application/workspace/workspaceServiceAnalysisDeepInsightsOps.ts` | `synthesizeDeepInsightsOp` |
| 治理合成 | `application/workspace/workspaceServiceAnalysisGovernanceRunnerOps.ts` | `synthesizeBusinessConfirmationOp`, `synthesizeGovernanceInsightsOp` |
| 全周期执行 | `application/workspace/workspaceServiceFullCycleOps.ts` | `runIterationFullCycleOp` |
| 代码改写 | `application/workspace/workspaceServiceCodeRewriteOps.ts` | `rewriteCodeInBoundaryOp` |
| 视觉编辑 | `application/workspace/workspaceServiceVisualEditOps.ts` | `executeVisualEditInstructionOp` |
| UX 指导 | `application/workspace/workspaceServiceUxGuidanceOps.ts` | `generateUxExecutionGuidanceOp` |
| 交付物 CRUD | `application/workspace/workspaceServiceChangeControlArtifactOps.ts` | `saveArtifactDraft`, `commitArtifact`, `confirmArtifact`, `transitionStage` |
| 交付物依赖 | `application/workspace/artifactDependencyGraph.ts` | `ARTIFACT_UPSTREAM_DEPS`, `buildUpstreamExcerpts` |
| 交付物工作流 | `application/workspace/workspaceServiceChangeControlArtifactWorkflow.ts` | `ensureArtifactWorkflow`, `markDownstreamStale` |
| 分析队列 | `application/workspace/workspaceServiceAnalysisQueueOps.ts` | `triggerAnalysisQueueOp`, `reconcileAnalysisJobsOp` |
| Skill 定义 | `skills/buildwise-openclaw/*/SKILL.md` | 15 个治理技能 SOP |
| Skill Chain 配置 | `skills/buildwise-openclaw/skill-chain.json` | 编排序列 + 合约 schema |
| Agent 角色模板 | `agents/prompts/agent.*.v2.md` | 14 个角色 prompt |
| Agent 目录 | `agents/catalog/agents.v1.json` | 角色定义(职责/输入/输出) |
| Coach 契约配置 | `agents/workflows/dynamic/iteration-coach.contract.json` | 引导流程 + 原则 + 约束 |
