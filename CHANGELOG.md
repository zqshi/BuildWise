# Changelog

本文件记录 BuildWise 的主要版本变更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式。

---

## [0.5.0] — 2026-03-22

### 新增
- **统一 Skill 注册表（SkillRegistry）**：三源合一（磁盘 Skill、全局自定义 Skill、策略 SkillsPlan），替代硬编码选择逻辑
- **SkillInjector SOP 注入**：选中 Skill 的完整 SOP 内容自动注入 Coach prompt，限额 8000 字符 / 3 个 Skill
- **策略回写闭环**：主窗口策略配置变更自动写入 Workspace，Coach 门禁实时感知
- **PolicyIntentParser**：从 LLM 回复中提取 `<!-- policy:{...} -->` 标记，解析为结构化策略意图
- **OntologyService 本体建模**：分析完成后自动填充 KB 全部 7 字段（术语、规则、组件清单、代码映射、决策日志、已知风险、变更模式）
- **OntologyCollisionDetector**：知识碰撞检测，识别 knowledgeHits 和 knowledgeConflicts
- **KnowledgeSyncService**：KB 变更实时序列化并注入 OpenClaw 上下文
- **Gateway 上下文增强**：项目聊天注入完整知识库 + Binding agentId
- **LLM 错误分类增强**：AbortError、网络超时、连接拒绝等统一归类为 502/503
- **Docker 容器化**：前后端独立 Dockerfile + docker-compose 编排
- **JWT 认证**：替代简单 token，支持过期刷新

### 变更
- `selectOpenclawSkills` 完全重写为基于 SkillRegistry 的选择引擎（stageSkillMap 优先 → 关键词匹配 → 全量兜底）
- `buildOpenclawSkillSelectionContext` 输出同时包含选择元数据和 SOP 注入内容
- `runOpenclawSkillChainForCoach` 从选中 Skill 的 SOP 元数据派生行动建议和检查清单
- Coach 交互契约支持渐进式 Skill 加载（`progressive_loading=yes`）
- 分析管道完成后自动调用碰撞检测
- `confirmAnalysis` 改用 OntologyService 填充全字段

### 删除
- 移除废弃的 Modeling 模块（`modelingService.ts`, `modelingSupport.ts`, `jsonModelRepository.ts` 及相关领域类型）
- 移除 `autobootRoutes.ts`
- 移除 `workspaceOpenclawSkillsBridge.ts` 中旧的硬编码 Skill 选择逻辑

---

## [0.4.0] — 2026-03-15

### 新增
- 15 个 OpenClaw 治理技能完整实装（00-orchestrator-sop → 11-product-rd-quality-contract）
- Creative Generator 端到端演示流程
- 前端 UI 风格升级（渐变、动效、响应式）
- 视觉 E2E 对齐校验（Browser Use）

### 变更
- OpenClaw Gateway 统一接入，替代分散 LLM 调用
- 服务层重构：拆分 Coach / Policy / ChangeControl / Openclaw 四组 Ops
- 安全加固：输入校验、HTML 注入防护、权限检查

---

## [0.3.0] — 2026-03-05

### 新增
- 项目知识库（KnowledgeBase）基础结构
- 跨迭代继承与 Delta 分类
- 发布评审与门禁决策（go / caution / block）
- 测试矩阵自动生成

---

## [0.2.0] — 2026-02-20

### 新增
- 文档上传与异步分析管道
- AI 教练对话式工作台
- 变更边界声明
- 交付物生命周期管理（草稿→提交→确认→发布）

---

## [0.1.0] — 2026-02-10

### 新增
- 项目与迭代 CRUD
- 前端工作台骨架（React + Vite）
- 后端 API 骨架（Fastify）
- RBAC 基础权限模型
