# BuildWise v2 Backend Production Readiness

更新时间：2026-03-24

## 评分口径

- 目标：把“可投产”拆成可验证的门禁项，而不是主观判断。
- 每项满分 10 分，总分 100 分。
- 评分区间：
  - `>= 85`：可受控投产（仍需灰度和回滚策略）。
  - `70-84`：准投产，存在中风险缺口。
  - `< 70`：不建议投产。

## 当前评分（本仓库）

- 当前分数：`86/100`
- 结论：`可受控投产`。当前仓库已具备 SQLite 固定门禁、生产模式配置阻断、Prometheus 文本指标导出、备份演练与受控发布验证脚本；仍建议在真实环境补齐告警平台接入与值班运营机制后再放量。

## 分项明细

| 维度 | 分数 | 当前状态 | 主要缺口 |
|---|---:|---|---|
| 构建与类型安全 | 9 | `verify:prod-readiness` / `verify:prod-readiness:sqlite` / `verify:prod-release` 可作为固定门禁 | 需继续保持 RC 分支全绿 |
| 契约测试（JSON） | 10 | 已通过 `test:contract` | 无 |
| 契约测试（SQLite） | 9 | 已纳入 release verify 链并在 CI 固定执行 | 需持续保留报告归档 |
| 运行时稳定性 | 9 | `/health` `/ready` 已分离，启动不再阻塞 LLM 探针，具备优雅停机与限流 | 缺少统一外部依赖可观测接入 |
| 安全基线 | 9 | 已支持 `jwt`，`AUTH_MODE=off` 默认 viewer，生产禁止 `off` | 缺少密钥轮换、审计告警联动 |
| 数据可靠性 | 9 | 生产模式强制 SQLite、禁用 seed bootstrap，备份恢复演练已纳入 release verify | 需在真实备份介质和对象存储上再演练一次 |
| 仓库与迭代追溯 | 10 | 项目仓库、迭代 code-link、反查链路已打通 | 无 |
| 可观测性 | 8 | 已有运行时快照、Prometheus 文本指标导出和基础运维脚本 | 仍缺统一 trace/log 聚合 |
| 发布治理 | 9 | CI 已固定执行 production release verify，回滚与发布前清单已齐备 | 需在真实部署环境保留放行记录 |
| 运维文档与SOP | 7 | 已补运维脚本、生产操作说明、workspace 约束、发布前清单与受控发布验证说明 | 仍需真实 oncall 值班手册与复盘制度 |

## 已实现的硬能力

- 每个项目可绑定仓库元信息，并支持建仓/脚手架/发布流程。
- 每个迭代可绑定 `branch/tag/commit/pr/paths`，并支持按 ref 反查迭代。
- SQLite 提供 typed table（`projects`/`iterations`/`messages`/`audit_logs`）提升高频查询。
- 运行时具备健康检查、限流、安全响应头、优雅停机。
- OpenClaw 集成已收敛为“单 Agent、项目级 workspace、迭代级 session”模型。
- 项目知识资产已物化到 `workspacePath/.buildwise/`，支持分片、索引与按需检索。
- 同一路径不能绑定多个项目，项目级 workspace 隔离已成为运行时约束。

## 剩余高优先级项（放生产前建议完成）

1. 在 staging/production 实际部署链路中固定执行 `verify:prod-release` 并保留报告。
2. 将 `/metrics` 接入 Prometheus 或同类采集器，并将关键阈值映射到告警平台。
3. 将 `ops:backup-drill` 接入定时任务并留存演练报告。
4. 将 `ops:alerts` 与 `ops:llm-check` 接入告警平台（飞书/Slack/PagerDuty）并定义升级路径。
5. 补齐真实值班与应急 SOP（告警分级、责任人、升级路径）。

## 推荐执行命令

```bash
cd v2/backend
npm run verify:prod-readiness
npm run verify:prod-readiness:sqlite
npm run verify:prod-release
npm run ops:preflight
npm run ops:llm-check
npm run ops:alerts
PROJECT_ID=1 npm run ops:rollback
STORAGE_BACKEND=sqlite npm run ops:backup-drill
```

CI 说明：

- `.github/workflows/ci.yml` 的 `ops-preflight` 会自动判断是否存在 `LLM_API_BASE` secret。
- 存在时启用严格 LLM 门禁（configured/reachable 必须通过）；不存在时按宽松策略运行并输出报告。
