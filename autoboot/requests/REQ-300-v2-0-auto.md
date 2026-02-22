# 迭代候选：V2.0 多角色实时协同基础

目标：支持项目内多角色实时协同视图与状态同步。

frontend
backend
docs

DOC_FILE: docs/32-平台生态目标迭代计划.md

# 路线图输入
- 前端：协同在线状态、角色标识、实时变更提示。
- 后端：协同会话与在线成员 API。
- 验收：同项目可看到成员在线状态与最新变更。

# 单系统叠加模式：不新增页面文件，仅在统一工作台叠加能力。
API: GET /api/roadmap-v2-0
FIELD: Iteration20.status string required
