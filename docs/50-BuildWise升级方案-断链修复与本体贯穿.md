# BuildWise 升级方案：断链修复与本体全流程贯穿

> 版本：v1.0 | 日期：2026-03-22
> 范围：四条核心断裂链修复 + 本体论全流程贯穿 + OpenClaw 能力激活

---

## 一、当前现状诊断总图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BuildWise 当前架构                            │
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐    │
│  │  主窗口       │     │  项目窗口     │     │  迭代窗口         │    │
│  │  (全局助手)   │     │  (概览/知识)  │     │  (Coach 对话)    │    │
│  └──────┬───────┘     └──────┬───────┘     └────────┬─────────┘    │
│         │ ✗                  │ ✗                    │ △            │
│         ▼                    ▼                      ▼              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐    │
│  │ OpenclawGlobal│     │ ProjectPolicy│     │ CoachService     │    │
│  │ Service       │     │ Record       │     │ + SkillsBridge   │    │
│  │              │     │              │     │                  │    │
│  │ ·对话存储 ✓  │     │ ·策略定义 ✓  │     │ ·Coach对话 ✓    │    │
│  │ ·Skill CRUD ✓│     │ ·门禁配置 ✓  │     │ ·门禁检查 ✗假   │    │
│  │ ·策略回写 ✗  │     │ ·Skill计划 ✓ │     │ ·Skill执行 ✗    │    │
│  │ ·意图识别 ✗  │     │ ·执行联动 ✗  │     │ ·本体构建 △部分 │    │
│  └──────────────┘     └──────────────┘     └──────────────────┘    │
│         ↕ ✗ 无数据通路   ↕ ✗ 无执行通路     ↕ ✗ 无本体闭环         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    OpenClaw Gateway                          │   │
│  │  ·Chat API ✓   ·Session Key ✓   ·Agent Routing ✓           │   │
│  │  ·Memory   ✗   ·Cron      ✗   ·Skills(原生) ✗             │   │
│  │  ·Hook     ✗   ·ContextEngine ✗  ·Vector Search ✗          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  标记说明：✓ 已实现  ✗ 未实现  △ 部分实现                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 四条核心断裂链

| # | 断裂链 | 现状 |
|---|--------|------|
| 1 | 主窗口配置 → 策略回写 → Coach执行 | 主窗口只是聊天，不回写PolicyRecord；Coach门禁只检查1个硬编码条件 |
| 2 | Skill定义 → Skill选择 → Skill执行 | 三套Skill系统互不相通；15个Skill只有2个被选中；SKILL.md内容从未送达LLM |
| 3 | 技术本体 → 业务规则 → 知识沉淀闭环 | ContinuousModeling系统无数据来源；knowledgeHits/Conflicts从未填充；知识库5个核心字段是死字段 |
| 4 | 全局对话 → 项目知识 → 迭代上下文 | 全局/项目/迭代三层对话各自独立；OpenClaw高价值能力全部闲置 |

---

## 二、目标架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                     BuildWise 目标架构                               │
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐    │
│  │  主窗口       │     │  项目窗口     │     │  迭代窗口         │    │
│  │  流程元配置器  │     │  本体+知识可视│     │  教练工作场所     │    │
│  └──────┬───────┘     └──────┬───────┘     └────────┬─────────┘    │
│         │                    │                      │              │
│         ▼                    ▼                      ▼              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Orchestration Layer（编排层）                    │   │
│  │                                                             │   │
│  │  ┌─────────────┐  ┌───────────┐  ┌──────────────────────┐  │   │
│  │  │ PolicyEngine │  │SkillRouter│  │ OntologyService      │  │   │
│  │  │             │  │           │  │                      │  │   │
│  │  │ ·意图识别   │  │ ·统一加载 │  │ ·技术层自动构建      │  │   │
│  │  │ ·结构化解析 │  │ ·策略驱动 │  │ ·业务规则映射        │  │   │
│  │  │ ·策略回写   │  │ ·内容注入 │  │ ·知识碰撞检测        │  │   │
│  │  │ ·门禁执行   │  │ ·执行反馈 │  │ ·跨迭代增量继承      │  │   │
│  │  └──────┬──────┘  └─────┬─────┘  └──────────┬───────────┘  │   │
│  │         │               │                    │              │   │
│  │         └───────────────┼────────────────────┘              │   │
│  │                         │                                   │   │
│  └─────────────────────────┼───────────────────────────────────┘   │
│                            │                                       │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │              OpenClaw Agent（一个实例）                       │   │
│  │                                                             │   │
│  │  ┌─────────────┐  ┌───────────┐  ┌──────────────────────┐  │   │
│  │  │ Gateway API  │  │ Memory    │  │ Native Skills        │  │   │
│  │  │ + Session    │  │ + Vector  │  │ + SKILL.md           │  │   │
│  │  │   Key 隔离   │  │   Search  │  │   SOP 执行           │  │   │
│  │  └─────────────┘  └───────────┘  └──────────────────────┘  │   │
│  │                                                             │   │
│  │  Workspace 结构：                                           │   │
│  │  ├── global/          (主窗口配置，全局策略)                  │   │
│  │  ├── project-A/       (项目A 本体+知识+迭代记忆)             │   │
│  │  │   ├── memory/      (知识分片，OpenClaw自动索引)           │   │
│  │  │   ├── AGENTS.md    (项目级Agent指令)                     │   │
│  │  │   └── skills/      (项目级Skill覆盖)                     │   │
│  │  └── project-B/       (项目B 独立Workspace)                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、断链修复方案

### 断链 #1：主窗口 → 策略回写 → Coach执行

#### 3.1.1 当前问题

```
用户："测试阶段增加安全审查"
  → LLM返回自然语言建议
  → 存入OpenclawGlobalMessage
  → 结束（无后续处理）

PolicyRecord：只能通过REST API手动创建
evaluatePolicyGateForCoachOp：只检查firstIterationGitReport
Coach：不读取策略中的stages/gates/skillsPlan
```

#### 3.1.2 修复时序图

```
┌──────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐
│ 用户  │    │ OpenclawGlobal│    │ PolicyIntent │    │ PolicyEngine│    │ CoachSvc  │
│      │    │ Service       │    │ Parser       │    │             │    │           │
└──┬───┘    └──────┬───────┘    └──────┬──────┘    └──────┬──────┘    └─────┬─────┘
   │               │                   │                  │                 │
   │ "测试阶段增加  │                   │                  │                 │
   │  安全审查"     │                   │                  │                 │
   │──────────────>│                   │                  │                 │
   │               │                   │                  │                 │
   │               │ LLM对话(带策略     │                  │                 │
   │               │ 变更输出约束)      │                  │                 │
   │               │──────────────────>│                  │                 │
   │               │                   │                  │                 │
   │               │  返回结构化意图：   │                  │                 │
   │               │  {type:"add_gate", │                  │                 │
   │               │   stage:"testing", │                  │                 │
   │               │   artifact:        │                  │                 │
   │               │   "security-review"}                  │                 │
   │               │<──────────────────│                  │                 │
   │               │                   │                  │                 │
   │               │ 回写策略变更        │                  │                 │
   │               │──────────────────────────────────────>│                 │
   │               │                   │                  │                 │
   │               │                   │    mergePolicyDelta()              │
   │               │                   │    创建新版PolicyRecord            │
   │               │                   │    自动激活                        │
   │               │                   │                  │                 │
   │               │                   │                  │   下次Coach对话  │
   │               │                   │                  │<────────────────│
   │               │                   │                  │                 │
   │               │                   │    evaluateGate: │                 │
   │               │                   │    遍历所有gates  │                 │
   │               │                   │    检查required   │                 │
   │               │                   │    Artifacts      │                 │
   │               │                   │    检查human      │                 │
   │               │                   │    Confirmation   │                 │
   │               │                   │                  │   返回门禁结果   │
   │               │                   │                  │────────────────>│
   │               │                   │                  │                 │
```

#### 3.1.3 改造要点

**A. PolicyIntentParser — 新增模块**

位置：`v2/backend/src/application/openclawGlobal/policyIntentParser.ts`

职责：从 LLM 回复中提取策略变更意图。

```
输入：LLM 自然语言回复
输出：PolicyIntent | null

PolicyIntent 类型：
  | { type: "add_stage", stage: string, position: "before"|"after", anchor: string }
  | { type: "remove_stage", stage: string }
  | { type: "add_gate", stage: string, requiredArtifacts: string[], requireHumanConfirmation: boolean }
  | { type: "modify_gate", stage: string, changes: Partial<Gate> }
  | { type: "update_skills", add?: string[], remove?: string[] }
  | { type: "reset_default" }
```

实现方式：
1. 修改主窗口的 system prompt，要求 LLM 在回复末尾附加 `<!-- POLICY_INTENT:{...} -->` 格式的结构化标记
2. Parser 从回复中提取该标记，解析为 `PolicyIntent`
3. 若无标记或解析失败，返回 null（纯闲聊，不触发回写）

**B. PolicyEngine.mergePolicyDelta — 新增方法**

位置：`v2/backend/src/application/workspace/workspaceServicePolicyOps.ts`

```
mergePolicyDelta(repo, currentPolicy, intent: PolicyIntent) -> PolicyRecord

逻辑：
1. 深拷贝 currentPolicy.strategy
2. 根据 intent.type 执行对应变更
3. 创建新版 PolicyRecord（version+1，status=active）
4. 归档旧版
5. 记录 PolicyExecutionLog（action: "config_change", evidence: intent）
```

**C. evaluatePolicyGateForCoachOp — 重写**

当前：只检查 `firstIterationGitReport` 一个硬编码条件。

重写为：
```
evaluatePolicyGateForCoachOp(repo, iteration, message, activePolicy):
  1. 确定当前迭代所处 stage（基于 changeControl 中各阶段交付物状态）
  2. 查找 activePolicy.strategy.gates 中匹配当前 stage 的 gate
  3. 遍历 gate.requiredArtifacts：检查对应交付物是否 status=ready
  4. 检查 gate.requireHumanConfirmation：是否已有人工确认记录
  5. 返回 { blocked: boolean, reason: string, missingArtifacts: string[] }
```

**D. OpenclawGlobalService.sendMessage — 增加后处理**

在 LLM 回复存储后，增加：
```
const intent = policyIntentParser.parse(reply);
if (intent) {
  if (intent.type === "reset_default") {
    await restoreInitialMode(repo);
  } else {
    const current = await getEffectiveGlobalPolicy(repo);
    await mergePolicyDelta(repo, current, intent);
  }
}
```

---

### 断链 #2：Skill 定义 → Skill 选择 → Skill 执行

#### 3.2.1 当前问题

```
三套 Skill 系统各自独立：

系统A（文件Skill Pack）          系统B（Global Skill记录）       系统C（Policy skillsPlan）
  ·磁盘 SKILL.md 文件             ·openclaw-global.json           ·ProjectPolicyRecord
  ·skill-chain.json 注册10个       ·saveSkill() 动态写入           ·硬编码10个skill ID
  ·selectOpenclawSkills            ·activateSkill/deprecateSkill   ·从未被任何代码读取
    只匹配2个(10号和11号)           ·activeSkillIds 无消费者
  ·SKILL.md正文内容被丢弃          ·content字段完整但无人消费

三者之间零 import，零数据流通。
```

#### 3.2.2 统一 Skill 架构

```
┌─────────────────────────────────────────────────────┐
│                 Unified SkillRouter                  │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │          SkillRegistry（统一注册表）          │    │
│  │                                             │    │
│  │  数据源优先级：                               │    │
│  │  1. Policy skillsPlan（策略指定）             │    │
│  │  2. Global activeSkillIds（全局激活）         │    │
│  │  3. skill-chain.json（默认序列）              │    │
│  │                                             │    │
│  │  每个 Skill 统一结构：                        │    │
│  │  { id, name, description,                   │    │
│  │    sopContent: string,  ← SKILL.md 正文      │    │
│  │    source: "file"|"global"|"policy",         │    │
│  │    enabled: boolean }                        │    │
│  └──────────────────┬──────────────────────────┘    │
│                     │                               │
│  ┌──────────────────▼──────────────────────────┐    │
│  │          SkillSelector（策略驱动选择）        │    │
│  │                                             │    │
│  │  输入：                                      │    │
│  │  · activePolicy.strategy.skillsPlan          │    │
│  │  · 当前迭代 stage                            │    │
│  │  · 用户消息上下文                             │    │
│  │  · 项目知识库信号                             │    │
│  │                                             │    │
│  │  输出：                                      │    │
│  │  · selectedSkills: SkillEntry[]              │    │
│  │  · 每个含完整 sopContent                     │    │
│  └──────────────────┬──────────────────────────┘    │
│                     │                               │
│  ┌──────────────────▼──────────────────────────┐    │
│  │          SkillInjector（内容注入LLM）         │    │
│  │                                             │    │
│  │  将 selectedSkills 的 sopContent             │    │
│  │  注入到 Coach 的 system prompt 中            │    │
│  │  格式：                                      │    │
│  │  ## Active Skill: {name}                    │    │
│  │  {sopContent}                               │    │
│  │  ---                                        │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

#### 3.2.3 改造要点

**A. SkillRegistry — 合并三套数据源**

位置：`v2/backend/src/application/workspace/skillRegistry.ts`（新建）

```
loadUnifiedSkillRegistry(repo, activePolicy):
  1. 从 skill-chain.json 加载文件Skill（含 SKILL.md 完整正文）
  2. 从 OpenclawGlobalRepository 加载 activeSkillIds 对应的 Skill 记录
  3. 从 activePolicy.strategy.skillsPlan 读取策略级启用列表
  4. 合并去重：policy > global > file（优先级覆盖）
  5. 返回统一的 SkillEntry[] 列表
```

**B. SkillSelector — 策略驱动替代硬编码**

```
selectSkills(registry, context):
  1. 读取 skillsPlan 中当前 stage 对应的 skill 列表
  2. 若 stage = "agent-selected"，由 Agent 自行决策（注入全部 enabled skill 的摘要）
  3. 若 stage 指定了具体 skill，只注入指定的
  4. 上下文信号（knowledgeHits/domainTerms/analysisState）作为 Agent 选择的辅助信息
```

**C. SkillInjector — SKILL.md 正文送达 LLM**

当前 `loadSkillPackEntries()` 只读 frontmatter，丢弃正文。改为：

```
loadSkillPackEntries():
  对每个 SKILL.md：
  - 解析 frontmatter → name, description
  - 读取正文 → sopContent（完整 SOP/Inputs/Outputs/Hard Rules）
  - 返回 { id, name, description, sopContent }
```

在 Coach prompt 构建时，将选中 Skill 的 sopContent 注入 system prompt，让 LLM 真正按 SOP 执行。

**D. 废弃 OpenclawGlobalSkillRecord 的独立 CRUD**

全局 Skill 不再通过 `openclawGlobalService.saveSkill()` 独立管理，而是通过主窗口策略变更（断链 #1 的 PolicyIntent `update_skills`）统一写入 PolicyRecord.skillsPlan。前端的 Skill 管理 UI 改为读取统一注册表。

---

### 断链 #3：技术本体 → 业务规则 → 知识沉淀闭环

#### 3.3.1 当前问题

```
两套本体系统平行运行，互不相通：

轨道A：ContinuousModeling 系统           轨道B：ChangeControl 中的本体数据
  ·完整的 OntologyTerm/BusinessEntity     ·traceabilityMap（LLM直接输出）
    /BusinessRelation/BusinessRule 结构    ·domainKnowledgeEntries（LLM直接输出）
  ·快照 diff + 版本管理                    ·用户确认后回写 ProjectKnowledgeBase
  ·但：无数据来源（空仓库）                ·但：不写入 ContinuousModeling
  ·但：无消费者                            ·但：只填充 ontologyTerms 和 stableRules

ProjectKnowledgeBase 七个字段中五个是死字段：
  componentInventory ✗  codeMap ✗  decisionLog ✗  knownRisks ✗  changePatterns ✗

knowledgeHits / knowledgeConflicts 从未被任何代码填充。
```

#### 3.3.2 本体双层架构与数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OntologyService（统一本体服务）                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │               技术层本体（自动构建，用户无感）                 │    │
│  │                                                             │    │
│  │  触发：附件分析完成 / 代码仓库扫描                            │    │
│  │                                                             │    │
│  │  ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐     │    │
│  │  │ 页面  │──│ 组件  │──│ API  │──│ 数据  │──│ 代码  │     │    │
│  │  │结构   │  │清单   │  │端点   │  │模型   │  │路径   │     │    │
│  │  └──────┘   └──────┘   └──────┘   └──────┘   └──────┘     │    │
│  │       ↕           ↕           ↕          ↕          ↕       │    │
│  │  四向映射表（traceabilityMap）                               │    │
│  │  自动写入 ContinuousModeling 快照                            │    │
│  │  自动填充 ProjectKnowledgeBase.componentInventory/codeMap    │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │ 技术本体作为映射目标                    │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │               业务规则层本体（用户驱动，Agent映射）            │    │
│  │                                                             │    │
│  │  用户："退货必须在签收后7天内发起"                             │    │
│  │         ↓                                                   │    │
│  │  Agent 识别业务规则                                          │    │
│  │         ↓                                                   │    │
│  │  关联到技术本体：                                             │    │
│  │    → 退货页面.时间校验组件                                    │    │
│  │    → POST /api/returns 的 deadline 参数                      │    │
│  │    → returns 表的 deadline 字段                               │    │
│  │    → src/pages/returns/validation.ts                         │    │
│  │         ↓                                                   │    │
│  │  结构化存储：BusinessRule {                                   │    │
│  │    rule: "退货必须在签收后7天内发起",                          │    │
│  │    linkedEntityIds: ["returns"],                             │    │
│  │    linkedSurfaceIds: ["returns-page"],                       │    │
│  │    linkedApiIds: ["post-returns"],                           │    │
│  │    linkedCodePaths: ["src/pages/returns/validation.ts"]      │    │
│  │  }                                                          │    │
│  │         ↓                                                   │    │
│  │  写入 ContinuousModeling 快照                                │    │
│  │  写入 ProjectKnowledgeBase.stableRules                      │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                       │
│                             ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │               知识碰撞检测（每次输入自动触发）                 │    │
│  │                                                             │    │
│  │  新输入 diff 已有知识库：                                     │    │
│  │  · knowledgeHits: 新输入命中已有规则（强化确认）              │    │
│  │  · knowledgeConflicts: 新输入与已有规则矛盾（需人工裁决）     │    │
│  │  · newTerms: 出现新术语（需确认并入本体）                     │    │
│  │                                                             │    │
│  │  写入 iteration.changeControl.knowledgeHits/Conflicts        │    │
│  │  Coach 对话时作为上下文信号                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.3.3 改造要点

**A. 打通 Analysis → ContinuousModeling 数据管道**

当前 `workspaceServiceAnalysisOps.ts` 将 LLM 输出的 `traceabilityMap` 和 `domainKnowledge` 存入 `changeControl`，但不写入 `ContinuousModeling`。

新增：分析完成回调中调用 `continuousModelingService.planIterationModeling()`：

```
分析完成后：
  1. 从 traceabilityMap 提取：
     · requirementToComponent → BusinessEntity[]
     · componentToCode → OntologyTerm[]（技术别名）
  2. 从 domainKnowledge.terms 提取：
     · term + definition + mappedTo → OntologyTerm[] + BusinessRule[]
  3. 调用 planIterationModeling(projectId, iterationId, {
       ontologyTerms, entities, relations, rules
     })
  4. 自动 saveCandidate → publishSnapshot
```

**B. 填充 ProjectKnowledgeBase 的五个死字段**

在 `confirmIterationAnalysisOp` 中，除了已有的 ontologyTerms 和 stableRules 回写外，增加：

```
确认时自动填充：
  · componentInventory ← traceabilityMap.requirementToComponent
  · codeMap ← traceabilityMap.componentToCode + requirementToCode
  · decisionLog ← 当次确认/否认决策记录
  · knownRisks ← analysisReport.risks（如果存在）
  · changePatterns ← 与上一迭代的 diff 模式
```

**C. 知识碰撞检测 — 新增 `detectKnowledgeCollisions()`**

位置：`v2/backend/src/application/workspace/ontologyCollisionDetector.ts`（新建）

```
detectKnowledgeCollisions(projectKnowledgeBase, newInput):
  1. 术语碰撞：新术语与已有 ontologyTerms 的别名匹配 → knowledgeHits
  2. 规则冲突：新规则与已有 stableRules 的语义冲突检测（LLM辅助判断）→ knowledgeConflicts
  3. 映射覆盖：新映射覆盖已有 codeMap 的路径 → 标记需确认
```

调用时机：
- 分析附件完成后
- 用户在迭代对话中描述业务规则后（Coach 后处理）

**D. 业务规则映射闭环 — Coach 后处理**

在 `coachIterationConversationOp` 的 LLM 回复解析后，增加业务规则提取：

```
Coach回复后处理：
  1. 从 LLM 回复中检测是否包含业务规则描述
     （通过 system prompt 要求 LLM 在回复中标记 <!-- BUSINESS_RULE:{...} -->）
  2. 若检测到：
     · 解析为 BusinessRule 结构
     · 调用 detectKnowledgeCollisions 检测冲突
     · 若无冲突：写入 changeControl.domainKnowledgeEntries + ContinuousModeling 候选
     · 若有冲突：在下次回复中告知用户，要求裁决
  3. 规则映射到技术本体：
     · 基于 traceabilityMap 自动关联 linkedEntityIds/SurfaceIds/ApiIds
     · 关联置信度低时提示用户确认
```

---

### 断链 #4：全局对话 → 项目知识 → 迭代上下文（OpenClaw 能力激活）

#### 3.4.1 当前问题

```
OpenClaw 当前只被当作"带 Session 的 Chat Proxy"使用。
高价值能力全部闲置：Memory/Vector Search/Cron/Hook/Context Engine/原生Skills

两条通道功能不对等：
  CLI直调路径：注入项目知识（本体/规则/组件/代码映射/决策/风险/变更模式）
  Gateway路径：只注入项目名+状态（丢失大量上下文）

Binding 字段（openclawProfile/agentId）在 Gateway 路径被忽略。
```

#### 3.4.2 目标集成架构

```
┌──────────────────────────────────────────────────────────────────┐
│                   BuildWise ← → OpenClaw 集成                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  BuildWise Backend                                        │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐   │  │
│  │  │ 主窗口       │  │ Coach对话     │  │ 分析管道       │   │  │
│  │  │ sendMessage  │  │ coachOp      │  │ analysisOps   │   │  │
│  │  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘   │  │
│  │         │                │                   │            │  │
│  │         ▼                ▼                   ▼            │  │
│  │  ┌──────────────────────────────────────────────────┐     │  │
│  │  │          OpenClawBridge（统一桥接层）              │     │  │
│  │  │                                                  │     │  │
│  │  │  · 统一 Gateway 调用（修复上下文注入）             │     │  │
│  │  │  · Session Key 派生（不变）                       │     │  │
│  │  │  · 知识同步：BuildWise → OpenClaw Memory          │     │  │
│  │  │  · Skill 注入：SKILL.md → system prompt           │     │  │
│  │  │  · Binding 字段生效                               │     │  │
│  │  └──────────────────────┬───────────────────────────┘     │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  OpenClaw Agent (单实例, agentId="main")                  │  │
│  │                                                           │  │
│  │  Gateway API：POST /v1/chat/completions                   │  │
│  │  Headers：X-OpenClaw-Agent-Id + X-OpenClaw-Session-Key    │  │
│  │                                                           │  │
│  │  Session Key 隔离：                                       │  │
│  │  ┌──────────────────────────────────────────────────┐     │  │
│  │  │ agent:main:global-{convId}     ← 主窗口          │     │  │
│  │  │ agent:main:project-{pid}       ← 项目窗口        │     │  │
│  │  │ agent:main:project-{pid}-iter-{iid} ← 迭代窗口   │     │  │
│  │  └──────────────────────────────────────────────────┘     │  │
│  │                                                           │  │
│  │  Workspace 文件结构（按项目隔离）：                        │  │
│  │  ~/.openclaw/workspaces/buildwise/                        │  │
│  │  ├── AGENTS.md          ← BuildWise 统一 Agent 指令       │  │
│  │  ├── skills/            ← BuildWise Skills（SKILL.md）    │  │
│  │  └── projects/                                            │  │
│  │      ├── project-1/                                       │  │
│  │      │   ├── memory/                                      │  │
│  │      │   │   ├── ontology.md    ← 技术本体摘要            │  │
│  │      │   │   ├── rules.md       ← 业务规则映射            │  │
│  │      │   │   ├── components.md  ← 组件清单                │  │
│  │      │   │   └── decisions.md   ← 决策日志                │  │
│  │      │   └── MEMORY.md          ← 记忆索引                │  │
│  │      └── project-2/                                       │  │
│  │          └── ...                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

#### 3.4.3 改造要点

**A. Gateway 路径补齐上下文注入**

当前 `gatewayProjectChat()` 的 system prompt 只有项目名+状态。改为与 CLI 路径对齐：

```
buildGatewaySystemPrompt(project, knowledgeBase, selectedSkills):
  1. 项目基本信息
  2. 项目知识库摘要（ontologyTerms, stableRules, componentInventory, codeMap）
  3. 选中 Skill 的 sopContent（完整注入）
  4. 当前迭代上下文（如果是迭代级调用）
  5. 策略门禁约束
```

**B. 知识同步：BuildWise → OpenClaw Memory**

新增 `KnowledgeSyncService`，在以下时机将 BuildWise 知识库同步到 OpenClaw Workspace 的 memory/ 目录：

```
同步时机：
  · 分析确认后（ontologyTerms/stableRules 变更）
  · 本体快照发布后（完整快照写入）
  · 业务规则映射完成后（新规则写入）

同步方式：
  · 将 ProjectKnowledgeBase 各字段序列化为 Markdown 文件
  · 写入对应项目的 memory/ 目录
  · OpenClaw 自动索引（SQLite + sqlite-vec + FTS5）
  · 后续 Coach 对话时，OpenClaw 可通过 memory_search 语义检索项目知识
```

**C. Binding 字段在 Gateway 路径生效**

```
gatewayProjectChat(repo, projectId, message):
  const binding = await repo.getWorkspaceBinding(projectId);
  if (binding) {
    // 使用 binding 中的 agentId，而非全局默认
    this.gatewayClient.setAgentId(binding.agentId);
    // 使用 binding 中的 profile 构造 workspace 路径
    this.workspacePath = deriveWorkspacePath(binding.openclawProfile, projectId);
  }
```

**D. 不需要 per-project BOOTSTRAP**

不创建 per-project 的 BOOTSTRAP.md。Agent 的认知上下文由三部分动态组装：
1. 全局 AGENTS.md — Agent 角色定义和通用能力
2. 项目 memory/ — 通过 KnowledgeSyncService 同步的项目知识
3. 迭代级 session — OpenClaw Session Key 持久化的对话历史

Agent 进入任何项目/迭代时，通过 session key 恢复上下文 + memory_search 检索项目知识，不需要显式的初始化流程。

---

## 四、本体论全流程贯穿时序图

### 4.1 完整迭代生命周期中的本体数据流

```
┌──────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐
│ 用户  │  │CoachSvc  │  │AnalysisSvc│  │OntologySvc│  │Continuous │  │Knowledge │
│      │  │          │  │          │  │(新建)     │  │ModelingSvc│  │SyncSvc   │
└──┬───┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └────┬─────┘
   │           │             │             │               │             │
   │ ══════════════════ 阶段1：clarification ═══════════════════════════ │
   │           │             │             │               │             │
   │ 上传PRD   │             │             │               │             │
   │──────────>│             │             │               │             │
   │           │ 触发分析     │             │               │             │
   │           │────────────>│             │               │             │
   │           │             │ LLM分析生成  │               │             │
   │           │             │ traceability │               │             │
   │           │             │ Map+domain   │               │             │
   │           │             │ Knowledge    │               │             │
   │           │             │             │               │             │
   │           │             │ ─────[NEW]──────────────────>│             │
   │           │             │ planIterationModeling()      │             │
   │           │             │ (自动，用户无感)              │             │
   │           │             │             │               │             │
   │           │             │             │  ────[NEW]───>│             │
   │           │             │             │  提取OntologyTerm            │
   │           │             │             │  +BusinessEntity             │
   │           │             │             │  +BusinessRule               │
   │           │             │             │               │             │
   │           │             │             │               │ saveCandidate│
   │           │             │             │               │ publishSnapshot
   │           │             │             │               │             │
   │ 确认分析   │             │             │               │             │
   │──────────>│             │             │               │             │
   │           │ confirmIterationAnalysis   │               │             │
   │           │──────────────────────────>│               │             │
   │           │             │             │               │             │
   │           │             │  ────[NEW]── 填充 ProjectKnowledgeBase    │
   │           │             │  ontologyTerms + stableRules              │
   │           │             │  + componentInventory + codeMap           │
   │           │             │  + decisionLog                           │
   │           │             │             │               │             │
   │           │             │             │  ─────────[NEW]────────────>│
   │           │             │             │  syncToOpenClawMemory()     │
   │           │             │             │  写入 memory/ontology.md    │
   │           │             │             │  写入 memory/rules.md      │
   │           │             │             │  写入 memory/components.md │
   │           │             │             │               │             │
   │ ══════════════════ 阶段2：scope ══════════════════════════════════ │
   │           │             │             │               │             │
   │ Coach引导  │             │             │               │             │
   │ 边界确认   │             │             │               │             │
   │──────────>│             │             │               │             │
   │           │ ────[NEW]──────────────>│               │             │
   │           │ 基于技术本体推导影响面    │               │             │
   │           │ "本次变更涉及3页面、     │               │             │
   │           │  5个API、2张表"          │               │             │
   │           │ （不是猜的，是本体推导的）│               │             │
   │           │             │             │               │             │
   │ ══════════════════ 阶段3：development ════════════════════════════ │
   │           │             │             │               │             │
   │ 代码变更后 │             │             │               │             │
   │──────────>│             │             │               │             │
   │           │ ────[NEW]──>│             │               │             │
   │           │ 检测本体diff │             │               │             │
   │           │ 新增代码路径 │             │               │             │
   │           │ 自动注册到   │             │               │             │
   │           │ 本体         │             │               │             │
   │           │             │             │               │             │
   │ ══════════ 业务规则灌入（贯穿全程，不限阶段）═════════════════════ │
   │           │             │             │               │             │
   │ "退货必须  │             │             │               │             │
   │  7天内"   │             │             │               │             │
   │──────────>│             │             │               │             │
   │           │ LLM回复含    │             │               │             │
   │           │ BUSINESS_RULE│             │               │             │
   │           │ 标记          │             │               │             │
   │           │ ────[NEW]──────────────>│               │             │
   │           │             │ detectKnowledgeCollisions    │             │
   │           │             │             │               │             │
   │           │             │ 无冲突：     │               │             │
   │           │             │ 映射到技术   │               │             │
   │           │             │ 本体并持久化 │               │             │
   │           │             │             │  ────────────>│             │
   │           │             │             │  更新快照      │             │
   │           │             │             │               │  ──────────>│
   │           │             │             │               │  同步memory │
   │           │             │             │               │             │
   │           │             │ 有冲突：     │               │             │
   │<──────────│ Coach提醒    │ 发现与已有   │               │             │
   │  "发现规则 │ 规则冲突    │ 规则冲突     │               │             │
   │   冲突,    │             │ 写入         │               │             │
   │   请确认"  │             │ knowledgeConflicts           │             │
   │           │             │             │               │             │
   │ ══════════════════ 阶段4：testing ════════════════════════════════ │
   │           │             │             │               │             │
   │ 生成测试矩阵             │             │               │             │
   │──────────>│             │             │               │             │
   │           │ ────[NEW]──────────────>│               │             │
   │           │ 基于本体覆盖率生成测试矩阵               │             │
   │           │ "这3个API无测试覆盖"    │               │             │
   │           │ "这2条业务规则无验证用例"│               │             │
   │           │             │             │               │             │
   │ ══════════════════ 阶段5：release ════════════════════════════════ │
   │           │             │             │               │             │
   │ 发布审查   │             │             │               │             │
   │──────────>│             │             │               │             │
   │           │ ────[NEW]──────────────>│               │             │
   │           │ 本体完整度检查：          │               │             │
   │           │ · 所有需求映射到功能？   │               │             │
   │           │ · 所有规则关联到代码？   │               │             │
   │           │ · 变更在白名单内？       │               │             │
   │           │ · 覆盖率 >= 阈值？      │               │             │
   │           │             │ 不达标→阻断 │               │             │
   │           │             │             │               │             │
   │ ══════════════════ 跨迭代继承 ════════════════════════════════════ │
   │           │             │             │               │             │
   │ 创建V1.1  │             │             │               │             │
   │──────────>│             │             │               │             │
   │           │             │  ──────────>│               │             │
   │           │             │  getLatestPublishedSnapshot  │             │
   │           │             │  (V1.0的本体)│               │             │
   │           │             │             │               │             │
   │           │             │  ← V1.0完整本体作为基线 ────│             │
   │           │             │  新迭代增量diff，不从零开始  │             │
   │           │             │             │               │             │
```

### 4.2 本体在每个阶段的具体产出

| 阶段 | 技术层本体动作 | 业务规则层动作 | 产出 |
|------|---------------|---------------|------|
| **clarification** | 自动：LLM分析→traceabilityMap→四向映射 | 自动：LLM提取domainKnowledge.terms | ModelSnapshot(candidate)、knowledgeBase.ontologyTerms/codeMap/componentInventory |
| **scope** | 自动：基于本体推导影响面 | 被动：碰撞检测（新需求 vs 已有知识） | 影响面报告、knowledgeHits/Conflicts |
| **interaction** | 自动：原型分析→页面/组件映射更新 | 主动：用户描述交互规则→Agent映射 | 本体增量更新（页面→组件链路补全） |
| **development** | 自动：代码变更→本体diff→新路径注册 | 主动：用户描述业务规则→Agent映射到代码 | BusinessRule.linkedCodePaths 填充 |
| **testing** | 消费：基于本体覆盖率生成测试矩阵 | 消费：基于业务规则生成验收用例 | 测试覆盖率 vs 本体覆盖率对比 |
| **release** | 消费：本体完整度作为发布门禁 | 消费：规则关联完整度作为门禁 | 发布审查评分 |
| **跨迭代** | 继承：上一版快照作为基线，增量diff | 继承：stableRules累积，conflicting rules标记 | 新迭代基线快照 |

---

## 五、核心调用链路关系图

### 5.1 策略配置→执行 完整调用链

```
用户(主窗口)                    BuildWise Backend                         OpenClaw
    │                               │                                      │
    │  "跳过原型阶段"               │                                      │
    │──────────────────────────────>│                                      │
    │                               │                                      │
    │        OpenclawGlobalService.sendMessage()                           │
    │                               │                                      │
    │                               │  1. 构建system prompt               │
    │                               │     (含策略变更输出约束)              │
    │                               │                                      │
    │                               │  2. runWithHistory()─────────────────>│
    │                               │                                      │
    │                               │  3. <── LLM回复 ────────────────────│
    │                               │     "好的...已跳过原型阶段             │
    │                               │      <!-- POLICY_INTENT:             │
    │                               │      {"type":"remove_stage",          │
    │                               │       "stage":"interaction"} -->"     │
    │                               │                                      │
    │                               │  4. policyIntentParser.parse(reply)   │
    │                               │     → intent: {type:"remove_stage"..} │
    │                               │                                      │
    │                               │  5. policyEngine.mergePolicyDelta()   │
    │                               │     读取当前 PolicyRecord             │
    │                               │     删除 interaction stage           │
    │                               │     删除 interaction gates           │
    │                               │     调整 skillsPlan                  │
    │                               │     创建新版 PolicyRecord v2         │
    │                               │     归档旧版 v1                      │
    │                               │                                      │
    │  <── "已调整流程..." ─────────│                                      │
    │                               │                                      │
    │                               │  === 后续迭代对话 ===                │
    │                               │                                      │
用户(迭代窗口)                      │                                      │
    │  "开始这个版本"               │                                      │
    │──────────────────────────────>│                                      │
    │                               │                                      │
    │        CoachService.coachIterationConversationOp()                   │
    │                               │                                      │
    │                               │  6. getEffectivePolicy()             │
    │                               │     → PolicyRecord v2                │
    │                               │     (stages: [clarification,scope,   │
    │                               │      development,testing,release,    │
    │                               │      archive])                       │
    │                               │     注意：interaction 已不在列表     │
    │                               │                                      │
    │                               │  7. evaluatePolicyGateForCoachOp()   │
    │                               │     遍历 gates[]                     │
    │                               │     检查 requiredArtifacts           │
    │                               │     检查 humanConfirmation           │
    │                               │     → {blocked: false}               │
    │                               │                                      │
    │                               │  8. skillRouter.selectSkills()       │
    │                               │     读取 skillsPlan → 当前stage的    │
    │                               │     Skill列表                        │
    │                               │     注入 SKILL.md sopContent         │
    │                               │                                      │
    │                               │  9. runWithHistory(prompt+skills)────>│
    │                               │                                      │
    │  <── Coach引导(跳过原型) ─────│                                      │
    │                               │                                      │
```

### 5.2 本体构建→知识沉淀 完整调用链

```
用户(迭代窗口)                    BuildWise Backend                   OpenClaw Workspace
    │                               │                                    │
    │  上传PRD附件                  │                                    │
    │──────────────────────────────>│                                    │
    │                               │                                    │
    │       AnalysisService.submitAnalysisJob()                          │
    │                               │                                    │
    │                               │ LLM分析 → traceabilityMap          │
    │                               │           + domainKnowledge        │
    │                               │                                    │
    │                               │ ┌─────────────────────────────┐    │
    │                               │ │ [NEW] OntologyService       │    │
    │                               │ │                             │    │
    │                               │ │ extractFromAnalysis():      │    │
    │                               │ │   traceabilityMap           │    │
    │                               │ │   → OntologyTerm[]          │    │
    │                               │ │   → BusinessEntity[]        │    │
    │                               │ │   → BusinessRelation[]      │    │
    │                               │ │                             │    │
    │                               │ │ domainKnowledge.terms       │    │
    │                               │ │   → BusinessRule[] (带      │    │
    │                               │ │     linkedEntityIds/        │    │
    │                               │ │     SurfaceIds/ApiIds)      │    │
    │                               │ └──────────────┬──────────────┘    │
    │                               │                │                   │
    │                               │                ▼                   │
    │                               │ ContinuousModelingSvc              │
    │                               │ .planIterationModeling()           │
    │                               │   → diff with baseline             │
    │                               │   → candidate snapshot             │
    │                               │   → review tasks (if conflict)     │
    │                               │                                    │
    │  确认分析准确                  │                                    │
    │──────────────────────────────>│                                    │
    │                               │                                    │
    │       confirmIterationAnalysisOp()                                 │
    │                               │                                    │
    │                               │ [NEW] 填充 ProjectKnowledgeBase:   │
    │                               │   ontologyTerms ← domainKnowledge  │
    │                               │   stableRules   ← acceptanceChecks │
    │                               │   componentInventory ← traceMap    │
    │                               │   codeMap       ← traceMap         │
    │                               │   decisionLog   ← 确认决策记录      │
    │                               │                                    │
    │                               │ publishSnapshot()                  │
    │                               │                                    │
    │                               │ [NEW] KnowledgeSyncService         │
    │                               │ .syncToOpenClawMemory()            │
    │                               │   → memory/ontology.md ──────────>│
    │                               │   → memory/rules.md ─────────────>│
    │                               │   → memory/components.md ────────>│
    │                               │   → memory/codemap.md ───────────>│
    │                               │                                    │
    │                               │              OpenClaw 自动索引 ───>│
    │                               │              SQLite+sqlite-vec     │
    │                               │              +FTS5                 │
    │                               │                                    │
    │  ══════ 后续对话中 ══════      │                                    │
    │                               │                                    │
    │  "退货必须7天内"               │                                    │
    │──────────────────────────────>│                                    │
    │                               │                                    │
    │       CoachService → LLM回复   │                                    │
    │       含 BUSINESS_RULE 标记    │                                    │
    │                               │                                    │
    │                               │ [NEW] OntologyService              │
    │                               │ .extractBusinessRule(reply)         │
    │                               │   rule: "退货必须7天内"             │
    │                               │   → 自动关联: returns-page,        │
    │                               │     post-returns-api,              │
    │                               │     returns.deadline               │
    │                               │                                    │
    │                               │ [NEW] detectKnowledgeCollisions()  │
    │                               │   对比 ProjectKnowledgeBase        │
    │                               │                                    │
    │                               │ ┌─ 无冲突 ─┐ ┌─ 有冲突 ──────┐   │
    │                               │ │写入changeControl            │   │
    │                               │ │写入ContinuousModeling       │   │
    │                               │ │同步OpenClaw memory ────────>│   │
    │                               │ └───────────┘ │写入Conflicts  │   │
    │                               │               │Coach下次提醒  │   │
    │  <── "规则已关联到退货页面..." │               └───────────────┘   │
    │  或 "发现与已有规则冲突..."    │                                    │
    │                               │                                    │
```

---

## 六、改造文件清单与影响范围

### 6.1 新建文件

| 文件路径 | 职责 | 关联断链 |
|----------|------|---------|
| `application/openclawGlobal/policyIntentParser.ts` | LLM回复→策略变更意图解析 | #1 |
| `application/workspace/skillRegistry.ts` | 统一Skill注册表（合并三套数据源） | #2 |
| `application/workspace/skillInjector.ts` | Skill SOP内容注入LLM prompt | #2 |
| `application/workspace/ontologyService.ts` | 统一本体服务（技术层+业务规则层） | #3 |
| `application/workspace/ontologyCollisionDetector.ts` | 知识碰撞检测 | #3 |
| `application/workspace/knowledgeSyncService.ts` | BuildWise→OpenClaw Memory同步 | #4 |

### 6.2 重写/重大修改文件

| 文件路径 | 改动内容 | 关联断链 |
|----------|---------|---------|
| `application/openclawGlobal/openclawGlobalService.ts` | sendMessage增加意图解析+策略回写后处理 | #1 |
| `application/workspace/workspaceServicePolicyOps.ts` | 新增mergePolicyDelta；重写evaluatePolicyGateForCoachOp | #1 |
| `application/workspace/workspaceServiceCoachOps.ts` | 读取统一SkillRegistry注入prompt；Coach回复后处理提取业务规则 | #1,#2,#3 |
| `application/workspace/workspaceOpenclawSkillsBridge.ts` | 重写：loadSkillPackEntries读取SKILL.md正文；selectSkills策略驱动 | #2 |
| `application/workspace/workspaceServiceAnalysisOps.ts` | 分析完成后调用OntologyService+ContinuousModeling | #3 |
| `application/workspace/workspaceServiceChangeControlCoreOps.ts` | confirmAnalysis时填充KB全部7字段 | #3 |
| `application/workspace/openclawService.ts` | Gateway路径补齐上下文注入；Binding字段生效 | #4 |
| `infrastructure/openclaw/openclawGatewayClient.ts` | 支持动态agentId（从binding读取） | #4 |

### 6.3 轻度修改文件

| 文件路径 | 改动内容 |
|----------|---------|
| `application/workspace/workspaceServiceQualityOps.ts` | 测试矩阵生成基于本体覆盖率 |
| `application/workspace/workspaceServiceAttachmentReportOps.ts` | 发布审查读取本体完整度 |
| `domain/openclawGlobal/types.ts` | PolicyIntent类型定义 |
| `domain/workspace/collaborationTypes.ts` | PolicyRecord.strategy增加version字段 |
| 前端：`openclawPromptComposer.ts` | 主窗口system prompt增加策略变更输出约束 |
| 前端：`OpenclawWorkspacePanel.tsx` | 策略变更成功后UI提示 |

---

## 七、分阶段实施计划

### Phase 1：打通策略配置→执行闭环（断链 #1 + #2）

**目标**：主窗口配置能真正影响迭代教练行为

```
Week 1-2：策略回写
  ├── 新建 policyIntentParser.ts
  ├── 修改主窗口 system prompt（增加策略变更输出约束）
  ├── OpenclawGlobalService.sendMessage 增加后处理
  ├── 新增 PolicyEngine.mergePolicyDelta
  └── 验证：主窗口说"跳过原型" → PolicyRecord变更 → 新迭代无原型阶段

Week 3-4：门禁执行 + Skill统一
  ├── 重写 evaluatePolicyGateForCoachOp（遍历所有gates）
  ├── 新建 skillRegistry.ts（合并三套数据源）
  ├── 重写 loadSkillPackEntries（读取SKILL.md正文）
  ├── 新建 skillInjector.ts（sopContent注入prompt）
  └── 验证：Coach真正读取策略配置 → 门禁生效 → Skill按策略选择和注入
```

**验收标准**：
- 主窗口自然语言 → PolicyRecord 结构化变更 → 可通过 API 查看变更后的策略
- Coach 对话时遍历 gates 检查 requiredArtifacts 和 humanConfirmation
- Coach prompt 中包含选中 Skill 的完整 SOP 内容（非仅 ID+description）
- "恢复默认"重置为 seed 策略

### Phase 2：本体双层构建闭环（断链 #3）

**目标**：技术层本体自动构建 + 业务规则映射 + 知识碰撞检测

```
Week 5-6：技术层本体自动化
  ├── 新建 ontologyService.ts
  ├── 修改分析完成回调 → 调用 ontologyService.extractFromAnalysis()
  ├── 打通 Analysis → ContinuousModeling 数据管道
  ├── confirmAnalysis 时填充 KB 全部7字段
  └── 验证：上传PRD → 分析 → ModelSnapshot自动生成 → KB自动填充

Week 7-8：业务规则层闭环
  ├── Coach system prompt 增加 BUSINESS_RULE 标记约束
  ├── Coach 回复后处理：提取规则 → 关联技术本体 → 持久化
  ├── 新建 ontologyCollisionDetector.ts
  ├── 填充 knowledgeHits / knowledgeConflicts
  └── 验证：用户说"退货7天内" → 规则映射到页面/API/代码 → 冲突时提醒
```

**验收标准**：
- 附件分析后自动生成 ModelSnapshot（candidate → published）
- ProjectKnowledgeBase 7个字段全部有数据流入
- 业务规则自然语言 → 结构化 BusinessRule → 关联到技术本体
- 新规则与已有规则冲突时 Coach 主动提醒
- 跨迭代时新迭代自动继承上一版本体

### Phase 3：OpenClaw 能力激活（断链 #4）

**目标**：从"Chat Proxy"升级为"知识驱动的智能底座"

```
Week 9-10：上下文补齐 + 知识同步
  ├── Gateway路径补齐上下文注入（与CLI路径对齐）
  ├── Binding字段在Gateway路径生效
  ├── 新建 knowledgeSyncService.ts
  ├── 知识变更时同步到 OpenClaw memory/ 目录
  └── 验证：Gateway路径的Coach对话包含完整项目知识上下文

Week 11-12：语义检索桥接 + 回归验证
  ├── OpenClaw memory_search 能力验证
  ├── Coach prompt 中引用 memory_search 结果
  ├── 端到端回归测试（全链路）
  └── 验证：Coach对话时能通过语义检索找到项目历史知识
```

**验收标准**：
- Gateway 路径注入的上下文与 CLI 路径对齐
- 知识变更后 3s 内同步到 OpenClaw memory/ 目录
- OpenClaw 自动索引可查（memory_search 返回结果）
- Binding 中的 agentId/profile 在 Gateway 路径生效

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM 输出 POLICY_INTENT 格式不稳定 | 策略回写失败或误操作 | 解析失败时静默跳过（不回写），不影响正常对话；关键变更要求用户确认 |
| SKILL.md 全文注入导致 prompt 过长 | token 超限 | 渐进注入：先注入摘要，Agent 按需请求完整 SOP；或按 stage 只注入当前阶段相关 Skill |
| 业务规则映射置信度低 | 错误关联 | 低置信度规则标记为 candidate，需人工确认后才写入正式知识库 |
| OpenClaw memory 目录写入权限 | 同步失败 | 启动时 probe 写入权限，失败时降级为 BuildWise 侧内存缓存 |
| 门禁重写可能阻断已有工作流 | 用户体验中断 | Phase 1 先灰度：新逻辑与旧逻辑并行，新逻辑产出仅记录日志不实际阻断，确认稳定后切换 |

---

## 九、成功指标

| 指标 | 当前值 | Phase 1 目标 | Phase 3 目标 |
|------|--------|-------------|-------------|
| 主窗口配置→Coach 执行的闭环率 | 0% | 80%+ | 95%+ |
| Skill sopContent 送达 LLM 率 | 0%（只送ID） | 100% | 100% |
| 门禁检查的 gate 覆盖率 | 1/4 硬编码 | 4/4 动态 | 4/4 动态 |
| 技术层本体自动构建率 | 0%（空仓库） | 100% 分析后自动 | 100% |
| 业务规则→技术本体映射率 | 0% | 70%+（高置信） | 85%+ |
| ProjectKnowledgeBase 活跃字段 | 2/7 | 7/7 | 7/7 |
| knowledgeCollisions 检测率 | 0% | 80%+ | 90%+ |
| OpenClaw 能力利用率 | 3/13（Chat+Session+Routing） | 3/13 | 7/13（+Memory+Vector+Skills+Profile） |
