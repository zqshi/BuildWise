# BuildWise OpenClaw Skills Pack

本技能包用于单 Agent 驱动的研发治理闭环。

## 目录
- `00-orchestrator-sop`：主编排技能
- `01-ontology-mapping`：本体建模与映射
- `02-impact-analysis`：影响面分析
- `03-deliverable-governance`：交付物治理
- `04-cross-iteration`：跨版本继承
- `05-exception-recovery`：异常恢复
- `06-quality-release-gate`：质量与发布门禁
- `07-audit-trace`：审计追踪
- `08-agentic-flow-contract`：Agent 主导交互契约（平台给约束，Agent 自主推进）
- `09-deliverable-content-contract`：交付物内容契约，约束 PRD、设计规范、技术架构、代码、测试、发布与归档内容完整性
- `10-business-rule-linking`：业务规则维度建模，把自然语言领域知识关联到工程本体
- `11-product-rd-quality-contract`：高质量产品研发全环节质量契约，覆盖 UX、原型、代码、测试与发布交接要求

## 边界原则
1. `00-orchestrator-sop` 只负责编排，允许 Agent 自行选择和排序 skills。
2. 其余 skills 只负责自己的单一职责，不接管整体流程。
3. 任一 skill 发现超出自身边界的问题，返回证据和建议，由 orchestrator 再决定下一步。
4. 不允许多个 skills 对同一个问题给出互相覆盖的最终结论。
5. 双维建模必须分层：
   - 工程本体由 `01-ontology-mapping` 负责建立与维护
   - 业务规则关联由 `10-business-rule-linking` 负责沉淀与映射
6. 高质量研发流程检查由 `11-product-rd-quality-contract` 负责，不允许只因为“有交付物”就放行下一阶段。

## 统一返回契约
```json
{
  "status": "success|need_user_input|blocked|error",
  "summary": "string",
  "artifacts": [{"id":"string","title":"string","state":"draft|committed|confirmed"}],
  "questions": ["string"],
  "risks": ["string"],
  "next_actions": ["string"],
  "evidence": ["string"]
}
```

## 运行模式
- 优先：`openclaw-native`
- 兜底：`bridge`（保持同一治理语义）
