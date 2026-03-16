# OpenClaw Real LLM Demo

## 目标
验证迭代推进在真实 OpenClaw + 大模型环境中执行，且每个环节都真实调用 LLM（不是 fallback/mock）。

## 前置条件
1. 后端已启动并可访问 `BUILDWISE_API_BASE`（默认 `http://127.0.0.1:5055`）。
2. 后端 LLM 运行时 `configured=true` 且 `reachable=true`。
3. 已准备迭代数据（可先执行 `npm run seed:agentic:flow` 并重启后端加载最新数据）。

## 执行
在 `v2` 目录执行：

```bash
npm run demo:openclaw:real
```

可选环境变量：
- `BUILDWISE_API_BASE`：后端地址
- `BUILDWISE_PROJECT_ID`：指定项目
- `BUILDWISE_ITERATION_ID`：指定迭代
- `BUILDWISE_DEMO_ACTOR`：写入消息/审计时的 actor 名称

## 校验逻辑
脚本会按以下环节依次执行：
1. clarification
2. boundary
3. development
4. testing
5. release

每个环节都会：
1. 先将对应交付物通过 `add-to-chat` 穿插进对话流。
2. 调用 `/api/iterations/:id/agent-chat`。
3. 强制校验：
   - `llm.used === true`
   - `llm.degraded === false`
   - `llm.model` 非空

任一环节不满足即失败退出。

## 输出
执行成功后会生成：
- `.artifacts/openclaw-real-llm-demo-<timestamp>.json`

其中包含每个环节的 intent、llm 元信息与回复预览，便于演示留痕。
