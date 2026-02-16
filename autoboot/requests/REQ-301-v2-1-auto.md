# 迭代候选：V2.1 上下文评论与任务锚点

目标：模型节点和代码块可挂载评论与任务。

frontend
backend
docs

DOC_FILE: /Users/zqs/Downloads/project/BuildWise/docs/32-平台生态目标迭代计划.md

# 路线图输入
- 前端：评论面板、@成员、任务锚点卡片。
- 后端：评论与任务关联 API。
- 验收：评论可关联节点并转为任务。

# 单系统叠加模式：不新增页面文件，仅在统一工作台叠加能力。
API: GET /api/roadmap-v2-1
FIELD: Iteration21.status string required
