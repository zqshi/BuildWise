# 自举循环迭代：目标分解（第二轮）

目标：围绕“业务意图编译器 + 统一项目模型 + 智能同步”，补齐面向用户的核心路径展示与 API 骨架。

frontend
backend

PAGE: 智能同步 | /sync
PAGE: 规则编译 | /rules
API: GET /api/sync/status
API: GET /api/rules
FIELD: Project.version string required
FIELD: Rule.name string required
FIELD: Rule.type string
