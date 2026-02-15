# 迭代 4：同步引擎 MVP

目标：变更检测 → 影响分析 → 增量同步的骨架与可视化占位。

frontend
backend

PAGE: 变更检测 | /diff
PAGE: 同步报告 | /sync-report
API: GET /api/diff
API: GET /api/sync/report
FIELD: Diff.type string required
FIELD: Diff.target string
FIELD: SyncReport.summary string
