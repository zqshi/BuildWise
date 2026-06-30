# Backlog — 后续版本规划池

> 已启动版本移入对应 `vX.Y.Z-current.md`。本文件只保留未启动版本规划与跨版本约束。
> V1-V4 升级方案已全量完成（v0.6.0→v0.10.0），归档见各 `vX.Y.Z-snapshot.md`。

## 跨版本约束

- **不修改 OpenClaw 源码**：OpenClaw 仅作为可切换适配器之一，通过 Gateway/CLI 调用
- **Agent 框架可切换**：声明+运行时分离（CodingAgentAdapter 端口 + AgentRegistry，V2.1 落地），更换框架不影响业务层
- **门禁严格遵守**：policyGate 硬阻断 + postExecutionVerifier 统一后验 + gate_bypass_attempt 审计（V3 落地）
- **核心价值闭环**：活的知识链条（本体）——编码 agent 改动回流 codePaths → 本体随真实代码演进（V4 落地）
- **DDD/TDD/文件治理**：domain 零外部依赖、单文件≤800行、单函数≤60行、先写测试再实现
- **迭代纪律**：每版本归档前过 6 项质量检测协议，verify:all 全绿才归档

---

## 已完成版本（归档 snapshot）

- v0.6.0+v0.6.1 — V1 迭代纪律 + Skill 死代码清理 + 预先存在债务收尾
- v0.7.0 — V2.1 Agent 适配器抽象 + 注册表
- v0.8.0+v0.8.1 — V2.2 ClaudeCodeCliAdapter + codeRewrite 异步化 + 事后边界校验
- v0.9.0 — V3 policyGate 硬阻断 + 统一后验层 + 绕过检测
- v0.10.0 — V4 编码 agent 改动回流本体 + 经验沉淀定时扫描 + 前端图谱 diff

---

## 待处理遗留项（任务化，供新会话接续）

### P0 — v0.27.0→v0.31.0 已归档；v0.32.0 活跃（投产前卫生收口：lint 清理 + DEPLOY.md）
- **v0.20.0 已归档**（2026-06-28，snapshot c0149d5，规范漂移校正 T1-T6，详见 [v0.20.0-snapshot.md](v0.20.0-snapshot.md)）
- **v0.21.0 已归档**（2026-06-28，前端副作用单测，T1 解 node --test 无扩展名 import 限制[tsx]+T2 fetchJSON 403 dispatch 副作用单测[jsdom] done，**T3 useAuthController hook 副作用单测已由 v0.26.0 T6 收口**——引入 @testing-library/react，详见 [v0.21.0-snapshot.md](v0.21.0-snapshot.md)）
- **v0.22.0 已归档**（2026-06-28，owner 分支收敛重新设计：保留 owner 块 + resolveTenantRole 加 isPlatformOwner 旁路，区分真超管 platformRoleBinding / dev owner AUTH_MODE=off / 租户 owner 三类语义，修正 v0.18.0 方案B 删块覆辙，详见 [v0.22.0-snapshot.md](v0.22.0-snapshot.md)）

当前活跃 current：v0.32.0（投产前卫生收口：T1 后端 12 处 lint warnings 清理[类型守卫替代 !] + T2 DEPLOY.md 部署 runbook）。v0.31.0 已归档（2026-06-30，按端展示端到端实跑验证：T2 重跑确认 perPlatform 真实产出 + T3 前端按端渲染 DOM 验证[@testing-library/react 真实数据]，详见 [v0.31.0-snapshot.md](v0.31.0-snapshot.md)）

后续版本规划（依次推进）：
- **v0.30.0（已归档，2026-06-29）** — 按端质量数据 + LLM 按端评审：T1 测试矩阵按端分组（synthesizeTestMatrixOp 独立 LLM 生成每条标 targetPlatform + summarizeTestMatrixByPlatform 按端聚合 + 前端按端展示）+ T2 代码路径按端白名单（codePathsByPlatform 平行字段 + summarizeCodeChangesByPlatform 按端统计 + assessPlatformCodeChangeReadiness 端级门禁 + synthesizeCodePathsByPlatformOp LLM 标注，不改 assertBoundaryWhitelist）+ T3 LLM 按端评审（synthesizeReleaseReviewOp params 加按端数据 + buildReleaseReviewPrompt 按端数据段/expectedOutput perPlatform + finalizeReleaseReviewPerPlatform 编造防控：有数据端漏评→block/无数据端降级整体 + qualityAudit 链对齐）。验证标准 3 条全达成 + verify:all 全绿（后端 670+前端 242 0 fail + 契约 passed）。详见 [v0.30.0-snapshot.md](v0.30.0-snapshot.md)
- **v0.27.0（已归档，2026-06-29）** — 剩余技术债统一收口：T1 A→B 回写改造为正名规范 + T2 4 核心超限文件拆分（coreOps/ontologyService/analysisOps/synthesisTaskOps）+ T3 Props Drilling 评估（55→10 全可选），详见 [v0.27.0-snapshot.md](v0.27.0-snapshot.md)
- **v0.26.0（已归档，2026-06-29）** — 遗留项统一收口：本体链 3 项（候选版本化+mock 一致+集成测试）+ 多租户遗留核实（typed table/assistant_messages 已生效无风险）+ 前端测试债（useAuthController hook 单测）。详见 [v0.26.0-snapshot.md](v0.26.0-snapshot.md)
- **v0.25.0（已归档，2026-06-29）** — 本体评审解决流程：建 resolveReviewTaskOp 标评审已解决 + publishSnapshot 前置检查未解决阻断评审，评审门禁从"发布即认可"升级为"发布前须解决阻断评审"。详见 [v0.25.0-snapshot.md](v0.25.0-snapshot.md)
- **v0.24.0（已归档，2026-06-28）** — 突出核心价值（活的知识链条），A套元能力门禁激活。详见 [v0.24.0-snapshot.md](v0.24.0-snapshot.md)
- **v0.23.0（已归档，2026-06-28）** — 多租户 DB 硬隔离：T2 修 syncTypedTables 写 projects.tenant_id + T3 查询层 listProjects/findProject 加 tenant scope。详见 [v0.23.0-snapshot.md](v0.23.0-snapshot.md)
- **v0.28.0 已归档（2026-06-29）** — 剩余技术债清扫：T1 analysisService 拆纯逻辑+接受聚合根内聚(438) / T2 biome-ignore 评估保留合理例外 / T3 删 ProjectsWorkspace 5 死代码占位 / T4 前端 hook 拆纯逻辑(2hook拆+2组件接受) / T5 dryRun 路径A 评估转后续手动。详见 [v0.28.0-snapshot.md](v0.28.0-snapshot.md)
- **后续专项（待立项）** — T5 dryRun 路径A 完整业务链路实跑（环境就绪需手动造数据+临时仓库+10min，路径B+fullCycle 已验证范式）/ 聚合根+hook 内聚超限文件(analysisService 438/useProjectModelView 405/useIterationWorkspaceState 369/AnalysisDrawerPanels 530/DashboardView 447)接受不强拆 / 5 处 biome-ignore 合理例外保留

> v0.24.0 评审门禁语义说明：v0.25.0 已建评审解决流程，门禁已升级为"发布前须解决阻断评审"（candidate 有未解决 blocking 阻断 publish，全部解决后放行；published 后发布即认可保留不误阻）。
> v0.23.0 查询层说明：T3 聚焦 projects 表（租户边界根），其余 typed table 靠 project_id 链式关联 + 应用层覆盖，留后续按需扩展。

### P1 — dryRun 实跑验证（编码 agent 端到端）✅ 已完成（v0.11.0）
**结果**：实跑真实 claude CLI（2.1.177/glm-5.2）暴露并修复 ClaudeCodeCliAdapter 三缺陷——buildArgs 缺 `--verbose`（-p+stream-json 必需）/ `--permission-mode bypassPermissions`（headless 自动执行工具）；mapStreamEvent 缺 `type:"user"` 分支（真实 tool_result 内嵌在 user 消息）。真实 stream-json 样本补契约测试（TDD）。路径B 执行器集成验证（`scripts/dryrun-executor-integration.mjs`）跑通 V2.2 范式完整集成：改 button.tsx 合法保留 + 改 README.md 越界 git checkout 回滚。后端 431/431 + verify:all 全绿。详见 v0.11.0-snapshot.md。
**遗留**：路径A 完整 dryrun-code-rewrite.mjs（走后端 + 项目/迭代/scaffold/boundary 业务链路）未跑，V2.2 范式集成已由路径B 验证，路径A 留后续手动。

### P2 — 前端 diff 数据源接入（激活 isNew 高亮）✅ 已完成
**现状**：`mergeToUnifiedGraph` 已支持 `previousNodeIds` 参数 + `UnifiedGraphNode.isNew` + `UnifiedGraphView` 黄色高亮渲染 + 4 测试通过，但调用方 `useProjectModelView.ts:397` 未传 previousNodeIds，isNew 永远 undefined。
**任务**：
- `useProjectModelView.ts` 维护上一版本图谱节点 id 集合（ref/state，图谱数据变化时缓存旧版）
- 调用 `mergeToUnifiedGraph(modelView, knowledgeGraph, knowledgeGeneratedAt, previousNodeIds)` 传入
- 验证图谱新增节点黄色高亮 + title 标注「新增」

### P2 — 契约脚本重写 ✅ 已完成（v0.12.0）
**结果**：三 scenario（contractGovernance/contractLifecycle/contractGitIntake）路径 `/api/`→`/api/v1/` + 删 custom_roles 过时断言 + 挂回 verify:prod-release。首跑暴露并修复 4 个真实 bug：①setErrorHandler 500→400（schema 校验失败误报，runtimeHooks.ts）②LLM env ANTHROPIC_* 泄漏（production app 调真实 LLM 限流，verify-production-release.mjs）③gitIntake f5ea645 回归（iterationCoreOps :64 available→pending-confirmation + 询问消息 + gitIntakeOps :232 unknown→pendingConfirmationResponse）④契约路径。verify:all 全绿。详见 v0.12.0-snapshot.md。

### P3 — 前端 openclaw* 测试文件重命名 ✅ 已完成
**现状**：`tests/openclawMessagePresenter.test.ts` 等 3 文件名历史遗留，import 的源码已中性化（assistantMessagePresenter 等）。
**任务**：重命名文件 + 更新 import 路径

## 长期技术债务

| 债务 | 优先级 | 现状/计划 |
|------|--------|----------|
| 前端 Props Drilling（ProjectsWorkspace 55→10 全可选） | P3 | v0.17.0 T5 迁 7 Context 承载 → **v0.27.0 T3 已评估**：55 props（24 状态+31 回调）→ 10 全可选展示字段，状态/回调全迁 AppControllerContext，ProjectsWorkspaceConnector 零透传。残留 10 个 Connector 不传的预留占位（5 传子组件走默认值 + 5 `_` 完全不用）转后续评估接入/YAGNI 删除 |
| 多租户数据串（assistant/experience 路由 tenantId 从 query/body 取） | P0 | v0.17.0 T1 修复（改从 authTenantId 取）；owner 分支收敛 v0.22.0 已完成（保留 owner 块 + isPlatformOwner 旁路,区分真超管/dev owner/租户 owner）；DB 层硬隔离转 v0.23.0 |
| 持久化 JSON 无版本号 | — | **已过时**：JSON backend 已废弃（runtimeConfig.ts:111 强制 sqlite），迁移框架完备（schema_migrations + 001-008），版本号问题不存在 |
| 多租户 DB 层硬隔离（16 表加 tenant_id + 双写一致性） | P0 | v0.23.0 已归档（T2 写入层+T3 查询层 done，commit 21bb1e8+a330416）；listIterations 等 typed table tenant scope + assistant_messages 核实转 v0.26.0 T4/T5。**T4 已核实无风险**（v0.26.0）：listIterations/findIteration/listMessages 入口经 ensureIterationAccess/ensureProjectAccess 校验，listAuditLogs 是平台超管全局审计视图，无需强加 DB scope |
| per-prefix 超限文件 | P3 | v0.17.0 T3 拆 8 高风险+6 顺手 → **v0.27.0 T2 已拆 4 核心**（synthesisTaskOps 399→256/coreOps 431→199/analysisOps 530→228/ontologyService 455→141，拆非导出辅助零桥接零回归）。剩 11：前端 6（fetchJSON/DashboardView/AnalysisDrawerPanels/useIterationWorkspaceState/useProjectModelView/iterationWorkspacePanelUtils）+ 后端伪超限 4（platformOpsService/governanceRunnerOps/artifactOps/artifactWorkflow 职责单一不拆）+ analysisService 473（超软限 153，值得专项拆）+ analysisPipelineOps 321（超软限 1 临界）。另 T2 引入 5 处 biome-ignore（useImportType 对 typeof 误报）待重构显式类型消除 |
| mock modelingRepo saveCandidateSnapshot push vs 真实 upsert 不一致 | P2 | v0.25.0 T1 发现 → **v0.26.0 T2 已修复**：createInMemoryModelingRepo.saveCandidateSnapshot 改 upsert（同 id 覆盖）。修复 mock 掩盖的真实行为 bug——resolveReviewTask 写回同 id 时 mock push 下第二次 resolve 读旧快照致 resolved 未累积、publish 误阻断。T1 版本化 id 已让 saveCandidate 路径一致，T2 仅 resolve 写回路径受益 |
| 同 iteration publish 后 saveCandidate 同 id 覆盖 published 快照 | P2 | v0.25.0 T1 发现 → **v0.26.0 T1 已修复（方案 B）**：candidate id 含版本序号 `snapshot-X-Y-v${n}-candidate`（nextCandidateVersionNumber 纯函数 + planIterationModeling 接入），publish 后再 saveCandidate 生成新版本不覆盖 published；旧 id 无序号视为 v0 向后兼容 |
| onAnalysisConfirmed 自动 publish 集成链无测试守护 | P2 | v0.25.0 T2 发现 → **v0.26.0 T3 已补**：tests/ontology-onanalysis-confirmed.test.mjs 装配层测试 3 例覆盖 confirmIterationAnalysis→回调→saveCandidate→自动 publishSnapshot→门禁阻断停 candidate 全链 |
| A→B 回写（snapshotToKbPatch 正名规范） | — | v0.24.0 遗留 → **v0.27.0 T1 已处置**：调研推翻「回写空转」初判（回写有真实功能：HTTP saveCandidate 让前端直传本体项，publish 沉淀回 KB），但绕过正名链是数据源单一性真问题。落地为正名规范：snapshotToKbPatch 增强 key trim 归一（修 KB 项含空白重复沉淀 bug）+ 增量统计 + 审计日志 ontology.snapshot-merged。保留回写走正名链，非收敛为视图层（直接复用 extractKnowledgeBaseUpdateOp 不可行，强耦合分析报告追溯结构） |
