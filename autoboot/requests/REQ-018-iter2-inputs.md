# 迭代 2：多源输入对齐

目标：多源输入（Figma/草图/文本）解析占位与确认流程骨架。

frontend
backend

PAGE: 多源输入 | /inputs
PAGE: 解析确认 | /analysis
API: GET /api/inputs
API: GET /api/analysis
FIELD: Input.source string required
FIELD: Input.status string
FIELD: Analysis.confidence number
