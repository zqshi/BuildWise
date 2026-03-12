# Skills Runtime Pack

## 固定路线

BuildWise 后端已固定采用 `Agent + Skills` 单编排路线，不再维护多 Agent 切换模式。

## 本地技能包

- 源仓库：`https://github.com/majiayu000/claude-arsenal`
- 本地路径：`v2/backend/skills/claude-arsenal`
- 技能目录：`v2/backend/skills/claude-arsenal/skills`

## 使用约定

1. 统一由单编排 Agent（`orchestrator`）驱动技能链。
2. Prompt 保留为结构化输出契约，不再作为多角色扩散载体。
3. 更新技能包时，仅允许增量同步并保留本项目适配文档。
