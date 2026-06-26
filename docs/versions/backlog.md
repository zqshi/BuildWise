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
| 前端 Props Drilling（ProjectsWorkspace 50+ props） | P2 | 待评估，3-22 诊断遗留 |
| 持久化 JSON 文件无版本号、多租户字符串约定隔离 | P1 | 待评估，3-22 诊断遗留；SQLite 已有迁移框架未全面切换 |
| 19 个 per-prefix 超限文件（321-635 行，<800 硬限） | P3 | check-boundaries per-prefix 已降级为警告非阻断；各文件改动时拆分消警告 |
