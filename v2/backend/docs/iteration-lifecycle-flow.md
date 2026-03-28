# BuildWise 迭代全生命周期流程

> 本文档从代码实现中提取，描述单版本迭代内的完整流程、跨版本继承流程，以及两者的差异。
> 源码基线：2026-03-27

---

## 一、核心概念

### 迭代状态机（5 状态）

```
planned ──→ in-progress ──→ review ──→ completed
   │             │             │
   └──→ blocked ←┘─────────←──┘
         │
         └──→ in-progress / review
```

| 当前状态 | 可流转到 |
|---------|---------|
| planned | in-progress, blocked |
| in-progress | review, blocked, completed |
| review | in-progress, completed, blocked |
| blocked | in-progress, review |
| completed | （终态，不可流转） |

推荐路径：`planned → in-progress → review → completed`

### 交付物工作流阶段（7 阶段，严格顺序）

```
clarification → scope → interaction → development → testing → release → archive
```

阶段推进条件：当前阶段内**所有**交付物必须同时满足：
- `gateStatus = passed`（审核通过）
- `stale = false`（未被上游变更标记过期）
- `outputVersion > 0`（至少提交过一次）

---

## 二、交付物清单（15 个交付物 × 7 阶段）

```
阶段              交付物                          上游依赖
─────────────────────────────────────────────────────────────────
1. clarification  ① 需求分析报告                   (无)
                  ② 产品需求文档(PRD)               ①

2. scope          ③ 边界确认                       ①②

3. interaction    ④ 原型与交互                     ②③
                  ⑤ 设计规范                       ②③④

4. development    ⑥ 技术架构                       ②③⑤
                  ⑦ 接口设计(API)                  ⑥②
                  ⑧ 数据模型设计                   ⑥⑦
                  ⑨ 前端代码                       ⑥⑤④⑦
                  ⑩ 后端代码                       ⑥⑦⑧

5. testing        ⑪ 测试矩阵                      ②⑦⑨⑩
                  ⑫ 验收清单                       ②⑪

6. release        ⑬ 发布评审                       ⑫⑪⑨⑩
                  ⑭ 部署方案                       ⑥⑨⑩⑬

7. archive        ⑮ 交付归档                       ⑬⑭⑫
```

### 交付物生命周期

```
pending ──→ partial ──→ ready
                          │
           ┌──────────────┘
           ▼
    outputVersion += 1（提交）
           │
           ▼
    gateStatus: pending → passed / blocked（审核）
           │
           ▼
    上游变更时 → stale = true, gateStatus 重置为 pending
```

---

## 三、首版迭代完整流程

### Coach 引导流程（6 步）

```
① align-goal-and-scope     对齐目标与范围
② clarify-unknowns         澄清未知项
③ lock-boundary             锁定变更边界
④ plan-and-deliver          计划与交付
⑤ qa-and-release            测试与发布
⑥ archive                   归档
```

### 端到端流程图

```
创建项目
  │
  ▼
创建首版迭代（planned）
  │  · goals = 用户输入（兜底 = 迭代名称）
  │  · scope = 用户输入（兜底 = goals）
  │  · acceptanceCriteria 自动生成 = goals.map("X 可演示并通过验收")
  │  · continuity = 无继承（"首个迭代，无需继承。"）
  │  · assessment.baselineIterationName = "无基线"
  │  · 分析报告标题 = "首版需求分析报告"
  │
  ▼
[若项目配了 Git 仓库] Git 需求采集
  │  · 自动读取仓库代码结构，理解项目上下文
  │  · 仅首版迭代触发
  │
  ▼
流转到 in-progress
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 1: clarification                               │
│                                                     │
│  用户上传材料（需求文档/原型/截图等）                   │
│       │                                             │
│       ▼                                             │
│  自动触发 LLM 分析（10 步合成流水线）                   │
│       │  preflight:folder-selection                  │
│       │  preflight:execution-policy                  │
│       │  analysis:agent-plan（多 Agent 并行）          │
│       │  synthesis:attachment-insights               │
│       │  synthesis:project-profile                   │
│       │  synthesis:deep-business-governance          │
│       │  synthesis:report-quality                    │
│       │  synthesis:release-review                    │
│       │  finalize:report                            │
│       ▼                                             │
│  Coach 对话（LLM 注入分析上下文）                      │
│       │  · "这是第一轮迭代。"                         │
│       │  · 当前范围/排除项/验收标准                    │
│       │  · 分析报告摘要                              │
│       ▼                                             │
│  确认分析 ──→ 准确：分析报告 gate=passed              │
│         └──→ 不准确：进入澄清轮，可多轮往复           │
│                                                     │
│  编辑 & 提交 ① 需求分析报告                          │
│  编辑 & 提交 ② 产品需求文档(PRD)                      │
│  审核通过 ①② → gateStatus=passed                    │
│                                                     │
│  ══════ 阶段门禁检查 → 推进到 scope ══════           │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 2: scope                                        │
│                                                     │
│  锁定变更边界                                        │
│       · 需求映射 (requirementRefs)                   │
│       · 受影响组件 (componentRefs)                    │
│       · 代码路径 (codePaths)                         │
│       · 可执行约束自动生成                            │
│                                                     │
│  编辑 & 提交 ③ 边界确认                              │
│  审核通过 → 推进到 interaction                        │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 3: interaction                                  │
│                                                     │
│  上传/选择原型资产                                    │
│  编辑 & 提交 ④ 原型与交互                            │
│  编辑 & 提交 ⑤ 设计规范                              │
│  审核通过 → 推进到 development                        │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 4: development                                  │
│                                                     │
│  Coach 对话（LLM 注入上游交付物上下文）                │
│       · PRD + 边界 + 设计规范摘要自动注入 prompt      │
│                                                     │
│  编辑 & 提交 ⑥ 技术架构                              │
│  编辑 & 提交 ⑦ 接口设计                              │
│  编辑 & 提交 ⑧ 数据模型设计                          │
│  代码改写（可选）→ 提交 ⑨ 前端代码 / ⑩ 后端代码      │
│  审核通过 → 推进到 testing                            │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 5: testing                                      │
│                                                     │
│  自动生成测试矩阵（来自分析流水线）                    │
│  逐条执行：pending → passed / failed / blocked        │
│  编辑 & 提交 ⑪ 测试矩阵                              │
│  编辑 & 提交 ⑫ 验收清单                              │
│  审核通过 → 推进到 release                            │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 6: release                                      │
│                                                     │
│  LLM 合成发布评审（decision: go / caution / block）   │
│  编辑 & 提交 ⑬ 发布评审                              │
│  编辑 & 提交 ⑭ 部署方案                              │
│  审核通过 → 推进到 archive                            │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 阶段 7: archive                                      │
│                                                     │
│  归档交付物（materializedFiles）                      │
│  编辑 & 提交 ⑮ 交付归档                              │
│  审核通过                                            │
└─────────────────────────────────────────────────────┘
       │
       ▼
流转到 review → completed
  │
  │  · progress 自动设为 100
  │  · 评估快照自动记录
  │  · pendingItems 结转到下一版本的 carriedGoals
  │
  ▼
迭代完成 ✓
```

---

## 四、后续迭代（跨版本继承）完整流程

### Coach 引导流程（4 步）

```
① inheritance-diff-confirmation   继承差异确认
② delta-boundary-lock             增量边界锁定
③ incremental-delivery-and-qa     增量交付与测试
④ release-and-rollover            发布与结转
```

### 创建时自动继承的数据

| 数据 | 继承规则 |
|------|---------|
| goals | 用户输入 → 兜底前版 pendingItems → 兜底前版 goals |
| scope.inScope | 用户输入 → 兜底前版 inScope |
| scope.outOfScope | 用户输入 → 兜底前版 outOfScope |
| scope.acceptanceCriteria | 用户输入 → 兜底前版 acceptanceCriteria |
| continuity.inheritedFromIterationId | 前版 ID |
| continuity.inheritedSummary | "继承自 {前版名称}，并导入项目元信息" |
| continuity.carriedGoals | 前版 pendingItems（未完成项） |
| continuity.carriedRisks | 前版 risks |
| continuity.carriedDecisions | 前版决策累积 + 项目元信息 |
| assessment.baselineIterationName | 前版名称 |
| assessment.deltaInScope | 与前版范围的精确增/删差异 |
| assessment.resolvedItems | 前版有但本版去掉的项 = 已解决 |

### 端到端流程图

```
前版迭代 completed
  │
  │  自动结转：
  │  · pendingItems → 本版 carriedGoals
  │  · risks → 本版 carriedRisks
  │  · 已提交交付物 summary → 本版 Coach 上下文
  │
  ▼
创建后续迭代（planned）
  │  · 分析报告标题 = "继承差异分析报告"
  │  · assessment.deltaInScope = 精确增/删差异
  │  · Coach 上下文自动包含前版成果摘要
  │  · 不触发 Git 需求采集（仅首版触发）
  │
  ▼
流转到 in-progress
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ 步骤 1: inheritance-diff-confirmation                │
│         继承差异确认                                  │
│                                                     │
│  Coach 自动注入继承上下文：                            │
│       · "上一轮迭代是「{前版名称}」。"                │
│       · "继承说明：继承自 {前版名称}"                  │
│       · "继承目标：{carriedGoals}"                    │
│       · "继承风险：{carriedRisks}"                    │
│       · "继承决策：{carriedDecisions}"                │
│       · "上一版范围：{前版 inScope}"                  │
│       · "上一版已交付 N 项成果：..."                   │
│         （每项交付物摘要 120-200 字）                  │
│                                                     │
│  分析报告 draft 自动合成：                            │
│       # 继承差异分析报告                              │
│       ## 继承上下文（前版摘要+目标+风险）              │
│       ## 问题定义（本版范围）                          │
│       ## 版本差异（增/删/改）                          │
│       ## 分析质量 / 关键发现 / 追溯覆盖               │
│                                                     │
│  上传增量材料 → LLM 分析                              │
│       · LLM prompt 中 baseline = 前版名称             │
│       · versionDiff 包含精确的 added/changed/removed  │
│       · 治理 prompt 包含版本差异上下文                 │
│                                                     │
│  确认分析 → 分析报告 gate=passed                     │
│  编辑 & 提交 ① 需求分析报告 + ② PRD                  │
│  审核通过 → 推进到 scope                              │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 步骤 2: delta-boundary-lock                          │
│         增量边界锁定                                  │
│                                                     │
│  前版边界数据已继承，只需锁定增量部分                   │
│  编辑 & 提交 ③ 边界确认                              │
│  审核通过 → 推进到 interaction                        │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 步骤 3: incremental-delivery-and-qa                  │
│         增量交付与测试                                │
│                                                     │
│  interaction / development / testing 三阶段连贯推进   │
│                                                     │
│  Coach LLM prompt 包含前版已交付物上下文              │
│  上游依赖检查基于 outputVersion                      │
│                                                     │
│  编辑 & 提交 ④-⑫ 各交付物                           │
│  逐阶段审核通过 → 推进                               │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│ 步骤 4: release-and-rollover                         │
│         发布与结转                                    │
│                                                     │
│  LLM 发布评审包含回滚关注点                           │
│  编辑 & 提交 ⑬ 发布评审 + ⑭ 部署方案                 │
│  归档 ⑮ 交付归档                                    │
│  审核通过                                            │
└─────────────────────────────────────────────────────┘
       │
       ▼
流转到 review → completed
  │
  │  · pendingItems 结转到下一版本
  │  · 知识库沉淀（本体碰撞检测 + KB 更新）
  │
  ▼
迭代完成 ✓ → 可创建下一个继承迭代
```

---

## 五、首版 vs 后续迭代差异总结

| 维度 | 首版迭代 | 后续迭代 |
|------|---------|---------|
| 分析报告标题 | 首版需求分析报告 | 继承差异分析报告 |
| 分析报告定位 | 从零沉淀目标、业务对象、纳入/排除项 | 基于基线，聚焦增量差异和回滚关注点 |
| Coach 引导步骤 | 6 步（对齐目标→澄清→锁边界→交付→测试发布→归档） | 4 步（继承确认→增量边界→增量交付测试→发布结转） |
| Coach 上下文 | "这是第一轮迭代。" | 前版摘要 + 已交付成果 + 继承目标/风险/决策 + 前版范围 |
| 目标来源 | 用户输入，兜底=迭代名称 | 优先用户输入，兜底=前版 pendingItems |
| 范围初始化 | 全部从零定义 | 从前版 inScope/outOfScope/acceptanceCriteria 继承 |
| 版本差异 | deltaInScope 全部为"新增" | 精确计算与前版的增/删/改差异 |
| 风险/决策 | 空 | 从前版累积继承 |
| Git 需求采集 | 触发（若项目配了仓库） | 不触发 |
| LLM 分析基线参数 | `baseline=无基线` | `baseline=前版名称` |
| Draft 自动合成 | 无继承上下文章节 | 自动插入「继承上下文」章节 |

---

## 六、用户操作速查

### 单交付物操作链

```
编辑 draft（saveArtifactDraft）
  → 提交（commitArtifact）: outputVersion += 1, status = ready
    → 审核（confirmArtifact）: gateStatus = passed / blocked
      → 所有当前阶段交付物通过 → 推进阶段（transitionArtifactStage）
```

### 全周期一键执行（run-full-cycle）

```
分析 → 确认 → UX 指导 → 前端改写 → 后端改写
  → 测试生成 → 发布评审 → 交付归档 → 推送远端
```

每步可通过 input flags 跳过。

### 跨版本数据链路

```
迭代 N.pendingItems ──→ 迭代 N+1.carriedGoals
迭代 N.risks        ──→ 迭代 N+1.carriedRisks
迭代 N.decisions     ──→ 迭代 N+1.carriedDecisions（累积）
迭代 N.交付物.summary ──→ 迭代 N+1.Coach LLM 上下文
迭代 N.scope         ──→ 迭代 N+1.assessment.deltaInScope（差异计算）
```

---

## 七、关键源码索引

| 模块 | 文件 | 核心函数 |
|------|------|---------|
| 状态机 | `domain/workspace/iterationStateMachine.ts` | `validateTransition`, `suggestNextTransition` |
| 迭代创建 & 继承 | `application/workspace/workspaceServiceIterationFlowOps.ts` | `createIterationOp` |
| 继承数据合并 | `application/workspace/workspaceSupportCore.ts` | `buildMergedIterationPayload` |
| 交付物默认定义 | `application/workspace/workspaceServiceDefaultArtifactWorkflow.ts` | `buildDefaultArtifactWorkflow` |
| 交付物同步 & 门禁 | `application/workspace/workspaceServiceChangeControlArtifactWorkflow.ts` | `ensureArtifactWorkflow` |
| 交付物依赖图 | `application/workspace/artifactDependencyGraph.ts` | `UPSTREAM_DEPS`, `buildUpstreamExcerpts` |
| 交付物 CRUD | `application/workspace/workspaceServiceChangeControlArtifactOps.ts` | `saveArtifactDraft`, `commitArtifact`, `confirmArtifact`, `transitionStage` |
| 交付物 draft 合成 | `application/workspace/artifactDraftSynthesizer.ts` | `synthesizeArtifactDraftContent` |
| 分析确认 & 边界 | `application/workspace/workspaceServiceChangeControlCoreOps.ts` | `confirmIterationAnalysisOp`, `updateIterationBoundaryOp` |
| LLM 分析流水线 | `application/workspace/workspaceServiceAnalysisOps.ts` | `analyzeAttachmentOp` |
| Coach 对话 | `application/workspace/workspaceServiceCoachOps.ts` | `coachIterationConversationOp`, `buildCoachContext` |
| Coach 引导契约 | `application/workspace/workspaceCoachInteractionContract.ts` | `buildCoachContractContext` |
| 全周期执行 | `application/workspace/workspaceServiceFullCycleOps.ts` | `runIterationFullCycleOp` |
