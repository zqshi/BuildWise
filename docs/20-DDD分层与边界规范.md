# DDD 分层与边界规范

## 目的

定义 BuildWise 在前后端代码中的领域边界、依赖规则、目录职责和反模式约束，防止项目继续退化为跨层耦合的巨型工作台。

## 范围

本文档负责：

- 前后端分层规范
- 上下文边界
- 允许依赖与禁止依赖
- 文件与模块职责要求

本文档不负责：

- 具体对象字段定义
- 质量门禁命令细节
- 运维部署规则

## 关键结论

1. BuildWise 必须围绕 `Project / Iteration / Change Control / Knowledge` 这些领域对象组织代码，而不是围绕页面或接口堆逻辑。
2. `domain` 只表达概念与规则，`application` 只编排用例，`infrastructure` 只做适配，`interfaces` 只做协议转换。
3. 前端虽然是单页应用，也必须遵循领域边界，避免把业务规则塞进页面组件和 API 客户端。
4. 任何跨层取巧都必须被视为临时例外，而不是长期架构方式。

## 1. 后端分层

### 1.1 domain

职责：

- 领域类型
- 值对象
- 状态机
- 仓储接口
- 领域不变量

允许依赖：

- 标准库
- 同层 domain 模块

禁止依赖：

- `application`
- `infrastructure`
- `interfaces`
- Fastify、HTTP、数据库实现细节

### 1.2 application

职责：

- 用例编排
- 多个领域对象组合
- 事务型流程组织
- 调用基础设施端口

允许依赖：

- `domain`
- 基础设施抽象接口

禁止依赖：

- HTTP 请求/响应对象
- JSX 或 UI 组件

### 1.3 infrastructure

职责：

- JSON/SQLite 持久化
- OpenClaw 网关适配
- LLM、环境变量、日志、运行时探针

允许依赖：

- `domain`
- `application` 所定义的端口或使用方式

禁止依赖：

- 把领域决策写在适配器中

### 1.4 interfaces

职责：

- HTTP 路由
- 参数解析
- 状态码与错误响应
- 认证上下文提取

允许依赖：

- `application`
- `domain` 类型

禁止依赖：

- 在路由层直接修改仓储
- 在路由层实现领域规则

## 2. 前端分层

### 2.1 domain

职责：

- 领域类型
- 业务枚举
- 页面共享的领域概念

禁止依赖：

- `infrastructure`
- `pages`

### 2.2 app

职责：

- 前端用例编排
- 页面控制器
- 请求组合
- 视图状态和领域状态之间的粘合

### 2.3 infrastructure

职责：

- HTTP 客户端
- token 存储
- API 基础配置

禁止承担：

- 业务推理
- 页面流程判断

### 2.4 shared

职责：

- 无业务语义的纯工具

禁止承担：

- 领域类型
- 页面行为逻辑

### 2.5 pages

职责：

- 视图层
- 组件组合
- 交互展示

禁止承担：

- 长链路业务编排
- 核心业务规则推导

## 3. 上下文边界

### 3.1 Workspace Context

包含：

- Project
- Iteration
- Message
- Change Control
- Artifact Workflow
- Release Review

### 3.2 Governance Context

包含：

- Platform Role
- Project Role
- Policy
- Audit Log

### 3.3 Platform Context

包含：

- Template
- Snapshot
- Share
- Deployment
- Ops Metrics

### 3.4 Continuous Modeling Context

包含：

- Entity
- Rule
- Relation
- Review Task

## 4. 依赖规则

### 4.1 后端依赖矩阵

- `domain -> domain`
- `application -> domain`
- `infrastructure -> domain/application`
- `interfaces -> application/domain`

禁止：

- `domain -> *`
- `application -> interfaces`
- `interfaces -> infrastructure persistence internals`

### 4.2 前端依赖矩阵

- `domain -> domain`
- `app -> domain/infrastructure/shared`
- `pages -> app/domain/shared`
- `infrastructure -> shared`

禁止：

- `domain -> infrastructure`
- `pages -> infrastructure` 直接调用应尽量经由 `app`
- `shared -> domain/pages`

## 5. 反模式清单

以下行为视为边界破坏：

1. 在路由文件中写业务规则
2. 在仓储实现中拼接发布结论
3. 在 React 页面里内联复杂领域转换逻辑
4. 在工具文件中隐藏业务判断
5. 用“common utils”跨上下文复用不兼容语义

## 6. 文件职责约束

### 6.1 服务类

单个服务必须围绕一个子能力命名，例如：

- `AnalysisService`
- `ChangeControlService`
- `ProjectService`

禁止：

- 再创建“万能服务”承接多个无关职责

### 6.2 路由文件

单个路由文件应围绕：

- project
- iteration core
- change control
- policy
- platform

禁止：

- 一个路由文件同时包含项目、部署、权限、测试和建模逻辑

### 6.3 页面文件

页面组件应优先负责视图装配。  
超过阈值时，优先拆：

- presenter/model
- actions
- loaders
- drawer sections

## 7. 边界守卫要求

边界不是口头约定，必须由脚本守卫。  
至少需要：

1. 目录依赖检查
2. 行数阈值检查
3. 例外白名单

当前守卫脚本：

- `v2/scripts/check-boundaries.mjs`

## 8. 例外处理机制

允许临时例外，但必须满足：

1. 已记录在例外清单
2. 有拆分计划
3. 例外文件不能继续无边界扩张

例外不是默认开发方式，只是治理过渡手段。

## 9. In Scope

1. 前后端 DDD 分层
2. 上下文划分
3. 依赖规则
4. 文件职责约束

## 10. Out Of Scope

1. 测试命令清单
2. 业务对象字段表
3. 生产运行参数

## 11. 与其他文档的边界

相关文档：

- [20-技术架构设计（执行版）.md](./20-技术架构设计（执行版）.md)
- [42-研发治理规范（DDD-TDD-质量门禁）.md](./42-研发治理规范（DDD-TDD-质量门禁）.md)
- [47-DDD+TDD与1000行治理最高声明.md](./47-DDD+TDD与1000行治理最高声明.md)

本文档不负责：

- 统一模型字段设计
- 文档治理规范
