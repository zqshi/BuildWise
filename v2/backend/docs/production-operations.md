# BuildWise v2 Backend Production Operations

更新时间：2026-03-24

## 1. 发布前聚合检查（推荐）

```bash
cd v2/backend
npm run ops:preflight
```

覆盖项：

- 服务状态与就绪状态
- LLM 配置与连通性
- 运行时告警阈值（并发/延迟/限流/发布成功率）
- 测试矩阵覆盖率（基于已分析迭代）

返回码：

- `0`：全部通过
- `2`：触发告警
- `1`：检查失败（网络/接口错误）

发布前额外人工确认：

1. 探针配置使用 `/health` 作为 liveness，`/ready` 作为 readiness。
2. `AUTH_MODE=jwt` 且 `JWT_SECRET` 已替换为生产密钥。
3. `CORS_ORIGINS` 已按生产域名显式配置。
4. `STORAGE_BACKEND=sqlite`。
5. 每个项目的 `workspacePath` 独立且具备读写权限。
6. `workspacePath/.buildwise/` 已纳入备份策略并排除 Git 管理。
7. 当前发布分支必须先通过 `npm run check:boundaries` 与 `npm run verify:prod-readiness`，否则不能作为最终放行版本。

## 2. 告警基线检查

```bash
cd v2/backend
npm run ops:alerts
```

可选阈值（环境变量）：

- `ALERT_MAX_INFLIGHT` 默认 `200`
- `ALERT_MAX_AVG_LATENCY_MS` 默认 `800`
- `ALERT_MIN_DEPLOYMENT_SUCCESS_RATE` 默认 `95`
- `ALERT_MAX_RATE_LIMITED` 默认 `20`
- `ALERT_MIN_TEST_MATRIX_COVERAGE` 默认 `100`（仅 `ops:preflight` 使用）
- `API_BASE` 默认 `http://127.0.0.1:5055`

返回码：

- `0`：基线通过
- `2`：触发告警
- `1`：检查失败（网络/接口错误）

## 2.1 排障模板中心（新增）

接口：

```bash
curl -sS http://127.0.0.1:5055/api/ops/triage-templates
```

项目级读取：

```bash
curl -sS "http://127.0.0.1:5055/api/ops/triage-templates?projectId=1"
```

新增/更新（需要 `x-role: owner|developer`）：

```bash
curl -sS -X POST http://127.0.0.1:5055/api/ops/triage-templates \
  -H "Content-Type: application/json" -H "x-role: owner" \
  -d '{"projectId":1,"category":"db","keywords":["数据库","连接超时"],"commands":["curl -sS {{apiBase}}/api/ops/runtime"],"note":"数据库排障模板"}'
```

删除：

```bash
curl -sS -X DELETE http://127.0.0.1:5055/api/ops/triage-templates/<templateId> -H "x-role: owner"
```

返回：`templates[]`（关键词 + 命令模板 + 说明）。

命令模板支持占位符：

1. `{{projectId}}`
2. `{{apiBase}}`
3. `{{backendDir}}`

迭代详情页会根据排障步骤文本命中关键词并展开命令模板，支持一键复制。

## 3. LLM 基线检查

```bash
cd v2/backend
npm run ops:llm-check
```

可选策略（环境变量）：

- `LLM_CHECK_REQUIRE_CONFIGURED` 默认 `true`
- `LLM_CHECK_REQUIRE_REACHABLE` 默认 `true`
- `API_BASE` 默认 `http://127.0.0.1:5055`

返回码：

- `0`：LLM 基线通过
- `2`：触发告警（未配置/不可达/服务未就绪）
- `1`：检查失败（网络/接口错误）

## 4. 一键回滚（生成回滚部署）

```bash
cd v2/backend
PROJECT_ID=1 npm run ops:rollback
```

可选参数：

- `PROJECT_ID`：项目ID（默认 `1`）
- `ROLE`：调用角色（默认 `owner`）
- `ROLLBACK_VERSION`：指定回滚版本号（默认自动生成）
- `AUTO_COMPLETE=false`：仅创建并切到 `running`，不自动 `success`
- `API_BASE`：后端地址

行为：

- 基于项目最新部署环境创建一个“回滚部署”
- 继承部署对应 `iterationId`（若可用）
- 默认自动把回滚部署状态推进到 `success`

## 4.2 项目 workspace 运维约束

绑定接口：

```bash
curl -sS -X POST http://127.0.0.1:5055/api/v1/projects/1/workspace/bind \
  -H "Content-Type: application/json" -H "x-role: owner" \
  -d '{"openclawProfile":"buildwise-local","agentId":"main","workspacePath":"/srv/buildwise/openclaw/project-1","runtimeMode":"openclaw-native","locked":true}'
```

要求：

1. `workspacePath` 使用绝对路径。
2. 每个项目必须独立路径，不得复用。
3. 同一路径重复绑定不同项目时接口返回 `409 workspace_path_already_bound`。
4. BuildWise 项目知识资产会写入 `workspacePath/.buildwise/`。

建议备份目录：

1. `workspacePath/.buildwise/workspace.json`
2. `workspacePath/.buildwise/memory/`
3. `workspacePath/.buildwise/shards/`
4. `workspacePath/.buildwise/index/`

## 4.3 健康检查语义

1. `/health`
   - 用于 liveness
   - 只表示进程是否仍然存活
   - 仅在优雅停机期间返回 `503`
2. `/ready`
   - 用于 readiness
   - 反映存储依赖、模型文件探针和 LLM 连通性
   - 下游抖动时可以返回 `503`，但不应触发进程重启

## 4.1 发布硬门禁（新增）

当调用 `POST /api/iterations/:id/publish` 时，后端会执行以下阻断检查：

1. `changeControl.pendingHumanConfirmation=true` -> 返回 `409`（analysis confirmation required）
2. `changeControl.lastReleaseReviewDecision=block` -> 返回 `409`（release review blocked）

第二种情况下，响应会附带 `blockers[]`，用于前端直接展示阻断项与回滚建议。

## 5. 备份与恢复演练

JSON 模式：

```bash
cd v2/backend
STORAGE_BACKEND=json npm run ops:backup-drill
```

SQLite 模式：

```bash
cd v2/backend
STORAGE_BACKEND=sqlite npm run ops:backup-drill
```

可选参数：

- `WORKSPACE_DATA_FILE`：JSON 数据文件路径
- `WORKSPACE_DB_FILE`：SQLite DB 文件路径
- `BACKUP_ROOT`：备份根目录（默认 `./backups`）
- `DRILL_CLEANUP=true`：演练后删除产物

产出：

- 备份目录 `backups/drill-<timestamp>`
- 恢复检查文件（JSON 或 SQLite）
- 控制台输出演练报告（包含项目数/文件大小/校验结果）
