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
