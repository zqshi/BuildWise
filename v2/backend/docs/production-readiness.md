# BuildWise v2 Backend Production Readiness

更新时间：2026-02-16

## 评分口径

- 目标：把“可投产”拆成可验证的门禁项，而不是主观判断。
- 每项满分 10 分，总分 100 分。
- 评分区间：
  - `>= 85`：可受控投产（仍需灰度和回滚策略）。
  - `70-84`：准投产，存在中风险缺口。
  - `< 70`：不建议投产。

## 当前评分（本仓库）

- 当前分数：`82/100`
- 结论：`准投产`，与真实生产仍有约 `18%` 差距。

## 分项明细

| 维度 | 分数 | 当前状态 | 主要缺口 |
|---|---:|---|---|
| 构建与类型安全 | 10 | 已通过 `typecheck` + `build` | 无 |
| 契约测试（JSON） | 10 | 已通过 `test:contract` | 无 |
| 契约测试（SQLite） | 7 | 逻辑可跑，沙箱端口受限导致本地自动化不稳定 | 需在 CI/真实环境固定通过 |
| 运行时稳定性 | 8 | 已有 `/health` `/ready`、优雅停机、限流 | 缺少外部依赖探针（DB/GitHub） |
| 安全基线 | 8 | 已有基础安全头与 token 鉴权模式 | 缺少密钥轮换、审计告警联动 |
| 数据可靠性 | 9 | JSON/SQLite 双后端、迁移脚本 + 备份恢复演练脚本已具备 | 需在 CI 定期演练并留存记录 |
| 仓库与迭代追溯 | 10 | 项目仓库、迭代 code-link、反查链路已打通 | 无 |
| 可观测性 | 6 | 有运行时快照接口 | 缺少 metrics/trace/log 聚合（Prometheus/Otel） |
| 发布治理 | 8 | 有 CI 基础工作流、dry-run 发布路径与回滚脚本 | 需补灰度发布与环境门禁 |
| 运维文档与SOP | 7 | 已补运维脚本与操作文档 | 需补值班手册与故障复盘模板 |

## 已实现的硬能力

- 每个项目可绑定仓库元信息，并支持建仓/脚手架/发布流程。
- 每个迭代可绑定 `branch/tag/commit/pr/paths`，并支持按 ref 反查迭代。
- SQLite 提供 typed table（`projects`/`iterations`/`messages`/`audit_logs`）提升高频查询。
- 运行时具备健康检查、限流、安全响应头、优雅停机。

## 剩余高优先级项（投产前建议完成）

1. 在 CI 中强制跑通 `verify:prod-readiness:sqlite`（非沙箱环境）。
2. 接入统一日志与指标导出（至少错误率、延迟、请求量、限流命中率）。
3. 将 `ops:backup-drill` 接入定时任务并留存演练报告。
4. 将 `ops:alerts` 与 `ops:llm-check` 接入告警平台（飞书/Slack/PagerDuty）并定义升级路径。
5. 补齐值班与应急 SOP（告警分级、责任人、升级路径）。

## 推荐执行命令

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2/backend
npm run verify:prod-readiness
npm run verify:prod-readiness:sqlite
npm run ops:preflight
npm run ops:llm-check
npm run ops:alerts
PROJECT_ID=1 npm run ops:rollback
STORAGE_BACKEND=sqlite npm run ops:backup-drill
```

CI 说明：

- `.github/workflows/ci.yml` 的 `ops-preflight` 会自动判断是否存在 `LLM_API_BASE` secret。
- 存在时启用严格 LLM 门禁（configured/reachable 必须通过）；不存在时按宽松策略运行并输出报告。
