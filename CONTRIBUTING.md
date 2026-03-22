# 贡献指南

感谢你对 BuildWise 的关注。以下是参与贡献的基本约定。

## 开发环境

- Node.js >= 22, npm >= 10
- 推荐 VS Code + ESLint + Prettier

```bash
cd v2 && npm run install:all
npm run dev:stack:start
```

## 代码规范

### DDD 分层

```
domain/        → 纯领域类型，零外部依赖
application/   → 业务操作，Ops 函数模式：functionNameOp(repo, input)
infrastructure/→ 持久化、外部服务适配
interfaces/    → HTTP 路由，薄层转发
```

### 关键约束

- **每文件 < 1000 行**，单一职责
- **TDD**：先写测试（`node:test` + `assert/strict`），再写实现
- **函数式优先**：Ops 函数接受 repo + input，返回结果，无副作用
- **不修改 OpenClaw 源码**——只改 BuildWise 侧的适配层

### 测试

```bash
# 后端单元测试
npm --prefix v2/backend test

# 前端测试
npm --prefix v2 test

# 契约测试（需要后端运行）
npm --prefix v2/backend run test:contract

# 全量验证
cd v2 && npm run verify:all
```

## 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 添加策略回写闭环
fix: LLM 超时错误正确返回 502
refactor: SkillRegistry 三源合一
docs: 更新架构文档
test: 添加碰撞检测单元测试
chore: 清理废弃 Modeling 模块
```

## 分支策略

- `main` — 稳定分支
- `feat/*` — 功能开发
- `fix/*` — 缺陷修复

PR 合并前须通过 `npm run verify:all`。

## 架构决策

重要的架构决策记录在 `docs/` 目录中。新增决策请使用 `docs/templates/ADR-决策记录模板.md`。
