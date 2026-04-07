# BuildWise 工程规范

本文件自动注入所有 Agent 和 LLM 上下文，作为开发决策的强制约束。

---

## 一、架构原则：DDD 分层边界

```
domain/          ← 纯业务模型，零外部依赖，不引用 infrastructure 或 application
application/     ← 用例编排，调用 domain + infrastructure，不持有状态
infrastructure/  ← 技术实现（DB/LLM/HTTP），可替换，不反向依赖 application
interfaces/      ← 入口适配（路由/CLI），薄壳，仅做参数校验和转发
```

**依赖方向单向向下，禁止反转。** domain 层禁止 import 任何 application/infrastructure/interfaces 模块。

**聚合根边界**：每个业务概念（Project、Iteration、ChangeControl、Ontology）拥有独立的 Service + Ops 文件组，禁止跨聚合直接操作内部状态。

---

## 二、文件治理：硬性约束

| 规则 | 阈值 | 违规处理 |
|------|------|----------|
| 单文件行数上限 | **800 行**（含注释） | 必须拆分，不接受例外 |
| 单函数行数上限 | **60 行** | 提取子函数 |
| 单文件职责 | **一个且仅一个** | 文件名即职责声明 |
| 导出函数数量 | **≤ 10 个/文件** | 超出则按子域拆分 |
| 循环依赖 | **零容忍** | 通过接口或事件解耦 |

**命名即文档**：文件名必须完整表达职责。`workspaceServiceAnalysisGovernanceRunnerOps.ts` 这类无法一眼读懂的名称，必须拆为 `analysisQualityGate.ts` + `governanceInsights.ts`。

---

## 三、TDD 工作流：先写测试再写实现

每个功能变更必须遵循：

1. **Red** — 先写一个失败的测试，描述期望行为
2. **Green** — 用最小代码让测试通过
3. **Refactor** — 清理实现，测试必须持续通过

**测试分层**：
- **单元测试**：覆盖 domain 层所有纯函数，无 IO 依赖
- **集成测试**：覆盖 application 层用例，使用真实 SQLite（内存模式）
- **契约测试**：覆盖 interfaces 层 API 端点，验证请求/响应格式

**测试即规格说明**：测试描述用业务语言，不用技术术语。
```
// 好：「用户确认分析报告后，未收敛的澄清问题应阻断确认」
// 坏：「confirmIterationAnalysisOp returns ok=false when unresolvedQuestions.length > 0」
```

---

## 四、变更纪律：每次修改前必须完成

### 影响范围评估（Impact Check）

在动手写代码之前，必须回答：

1. **谁调用了我要改的函数？** — 用 Grep 追踪所有调用链
2. **改动会穿透几层？** — domain 改动影响最大，interfaces 改动最小
3. **哪些测试会受影响？** — 列出需要新增或修改的测试
4. **是否涉及持久化 Schema 变更？** — 需要写迁移脚本

### 变更完成检查（Done Checklist）

- [ ] `tsc --noEmit` 零错误
- [ ] 所有既有测试通过
- [ ] 新增代码有对应测试
- [ ] 无未使用的 import 或变量
- [ ] 无 `any` 类型逃逸（确需时用 `unknown` + 类型守卫）
- [ ] 相关文档已更新

---

## 五、面向业务的输出原则

**所有用户可见的文本，禁止出现以下内容：**

- 内部字段路径（`deep.cross.rootCauses`、`fileInsights.count`）
- 技术状态码（`clarification_questions_unresolved`）
- JSON 结构描述（`{publishable, score, missingItems[]}`）
- 英文技术术语（用「跨模块根因分析」而非 `crossFileInsights.rootCauses`）

**LLM Prompt 规则**：
- 给 LLM 的 Prompt 中，数据段和展示段必须分离
- 数据段用结构化字段传递（LLM 作为处理器）
- 展示段必须用自然语言模板（LLM 作为表达者）
- 禁止将内部 JSON 字段名直接拼入 userPrompt 让 LLM「自由发挥」

**Coach 对话历史注入规则**：
- system 角色消息在注入 LLM 上下文前，必须经过 `sanitizeForCoachContext()` 过滤
- 过滤掉：report quality JSON、内部审计日志、技术字段路径
- 保留：业务结论、用户可理解的摘要、澄清问题的自然语言描述

---

## 六、代码卫生：持续清理

**每次迭代结束前**：

1. 删除所有未被引用的文件（`bridge 模块`、`placeholder stub` 到期必须实现或移除）
2. 删除所有 `// TODO` 超过 30 天未处理的注释
3. 合并职责重叠的文件（如 `workspaceServiceAnalysisOps.ts` 与 `workspaceServiceAnalysisRunnerOps.ts` 如果职责模糊则合并或重新划分）
4. 清理 re-export 桥接层——如果短名和长名并存超过一个迭代周期，必须统一为一套命名

**禁止的代码模式**：
- 空函数 / 空类占位超过一个迭代
- `as any` 或 `!` 非空断言（用类型守卫替代）
- 超过 3 层的 `../../../` 相对路径（用 path alias）
- 在 catch 中吞掉错误不记录

---

## 七、文档同步：代码即文档，文档即约束

| 时机 | 更新内容 |
|------|----------|
| 新增聚合/领域概念 | 更新 `domain/` 下的类型定义 + 本规范的架构图 |
| API 端点变更 | 更新对应路由文件的 JSDoc + 契约测试 |
| 分析管道变更 | 更新 `docs/` 下的流程文档 |
| 配置项变更 | 更新 `.env.example` + `runtimeConfig.ts` 注释 |

---

## 八、Agent/LLM 注入指令

本规范通过 CLAUDE.md 自动注入每次 Agent 会话。当 Agent 执行以下操作时，必须自检：

- **写新文件前**：检查是否已有同职责文件，优先扩展而非新建
- **修改函数签名前**：Grep 所有调用方，评估影响范围
- **删除代码前**：确认无引用，且 `tsc --noEmit` 通过
- **生成用户可见文本前**：检查是否包含内部字段名或技术术语
- **完成任务后**：运行 `tsc --noEmit` + `npm test`，确认零回归
