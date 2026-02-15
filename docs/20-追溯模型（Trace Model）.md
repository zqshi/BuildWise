# 追溯模型（Trace Model）

## 目的
实现“模型节点 ↔ 代码片段”双向追溯，支撑精准同步与可回滚。

## 追溯对象
- 模型节点：实体/字段/规则/页面/组件
- 代码单元：文件、区块、AST 节点、API 路由

## 最小追溯结构

- `traceId`: 唯一标识
- `modelRef`: `{type, id}`
- `codeRef`: `{file, start, end, symbol}`
- `intent`: `create | update | delete`
- `source`: `auto | manual`
- `timestamp`

## 追溯策略

1. **注释锚点**
   - 在代码中插入 `// AUTOboot:BEGIN <id>` / `// AUTOboot:END <id>`
2. **文件级索引**
   - 记录文件路径与段落范围
3. **增量更新**
   - 对模型 diff 仅生成最小 patch

## 示例（代码片段）

```ts
// AUTOboot:BEGIN rule_price_gt_0
if (price <= 0) throw new Error("价格必须大于 0");
// AUTOboot:END rule_price_gt_0
```

## 决策日志
- 2026-02-09：采用注释锚点 + 文件索引的双层追溯
