# DDD 分层与边界规范

## 目标

- 以领域模型为中心组织代码，避免前后端继续演化为单文件巨石。
- 通过“行数限制 + 分层依赖约束”保证长期可维护性。

## 后端分层（`v2/backend/src`）

- `domain/`：领域对象与仓储接口，只表达业务概念与规则。
- `application/`：用例编排（服务层），不直接依赖 HTTP 或 UI。
- `infrastructure/`：文件存储、外部系统适配。
- `interfaces/`：HTTP 路由与请求响应适配。
- `index.ts`：依赖装配与启动入口，不放业务逻辑。

## 前端分层（`v2/src`）

- `domain/`：前端领域类型与核心概念。
- `infrastructure/`：HTTP 客户端、外部 API 访问。
- `shared/`：纯工具函数（无业务语义）。
- `App.tsx`：页面编排容器，禁止继续堆叠领域定义与基础设施细节。

## 依赖规则

- 后端 `domain` 不得依赖 `application/infrastructure/interfaces`。
- 后端 `application` 不得依赖 `interfaces`。
- 前端 `domain` 不得依赖 `infrastructure`。

## 行数限制（执行守卫）

守卫脚本：`v2/scripts/check-boundaries.mjs`

- `v2/src/domain/**` <= 220 行
- `v2/src/infrastructure/**` <= 220 行
- `v2/src/shared/**` <= 180 行
- `v2/src/App.tsx` <= 900 行（过渡阈值，后续逐步压缩）
- `v2/backend/src/domain/**` <= 220 行
- `v2/backend/src/application/**` <= 320 行
- `v2/backend/src/infrastructure/**` <= 360 行
- `v2/backend/src/interfaces/**` <= 280 行
- `v2/backend/src/index.ts` <= 140 行

## 执行命令

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2
npm run check:boundaries
```

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2/backend
npm run check:boundaries
```
