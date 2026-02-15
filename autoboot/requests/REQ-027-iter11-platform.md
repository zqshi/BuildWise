# 迭代 11：开放平台

目标：开放平台与第三方集成目录骨架。

frontend
backend

PAGE: 开放平台 | /platform
PAGE: 集成中心 | /integrations
API: GET /api/platform
API: GET /api/integrations
FIELD: Integration.name string required
FIELD: Integration.type string
FIELD: Platform.scope string required
