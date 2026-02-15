# AutoBoot 自举系统（BuildWise）

该目录提供一套最小可用的“自举开发流水线”，实现：

- 需求 → 自动修改 → 自动验证 → 可回滚
- 同时覆盖前端、后端、文档

## 目录结构

- `pipeline.py`：主流水线
- `requests/`：需求输入（Markdown）
- `plans/`：自动生成的计划（JSON）
- `runs/`：执行记录与备份
- `state.json`：最近一次执行状态

## 请求格式（最小）

在请求内容中包含 `frontend` / `backend` / `docs` 关键词即可触发对应更新。

可选：指定文档路径（用于写入自举章节）

```
DOC_FILE: /absolute/path/to/doc.md
```

## 扩展指令（自动化变更）

```
PAGE: 页面名称 | /route
API: GET /api/demo
FIELD: Entity.field string required
```

## 示例

```
python3 autoboot/pipeline.py run --request autoboot/requests/REQ-001-selfboot-demo.md
```

## 回滚

```
python3 autoboot/pipeline.py rollback
```

## 验证

```
python3 autoboot/pipeline.py verify
```

### 布局契约门禁（单入口对齐）

- 契约：`autoboot/contracts/layout_contract.v1.json`
- 门禁配置：`autoboot/gates/layout_gate.v1.json`
- 对比脚本：`autoboot/scripts/layout_diff.py`

手动执行布局差异对比：

```bash
python3 autoboot/scripts/layout_diff.py \
  --contract autoboot/contracts/layout_contract.v1.json \
  --threshold 0.82 \
  --out autoboot/state/layout_gate_report.json
```

说明：`pipeline.py verify` 与 `pipeline.py run` 会自动执行布局门禁，低于阈值将判定失败（并在 `run` 模式触发回滚）。

## 当前默认变更

- 前端：更新 `v2/src/App.tsx` 的自举提示区块
- 后端：更新 `v2/backend/src/index.ts`（`/api/status` 与 `/health`）
- 文档：在目标文档追加“自举系统”章节

## 单系统叠加模式

- 默认不再为里程碑创建新的独立 html 页面文件。
- `PAGE:` 仅用于能力登记与模型索引，不再触发新页面文件生成。

## 历史碎片页面归档（兼容命令）

```bash
# 预览
python3 autoboot/pipeline.py cleanup-legacy

# 执行归档（仅当 legacy 目录存在时）
python3 autoboot/pipeline.py cleanup-legacy --apply
```

## 阶段文档自动草案

- `autoloop` 每次执行完成后会自动生成：
  - 阶段 PRD 草案：`docs/milestones/*-PRD.md`
  - 阶段技术方案草案：`docs/milestones/*-TECH.md`
