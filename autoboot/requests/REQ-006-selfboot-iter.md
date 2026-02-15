# 自举循环迭代：目标分解（第五轮）

目标：完善角色权限与模型快照的基础展示与 API 骨架。

frontend
backend

PAGE: 角色权限 | /roles
PAGE: 模型快照 | /snapshots
API: GET /api/roles
API: GET /api/snapshots
FIELD: Role.name string required
FIELD: Role.scope string
FIELD: Snapshot.version string required
