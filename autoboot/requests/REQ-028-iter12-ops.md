# 迭代 12：交付与运维

目标：部署、监控、可观测性仪表的骨架。

frontend
backend

PAGE: 部署管理 | /deploy
PAGE: 可观测性 | /observability
API: GET /api/deployments
API: GET /api/observability
FIELD: Deployment.env string required
FIELD: Deployment.status string
FIELD: Observability.metric string required
