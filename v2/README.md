# BuildWise v2 交付与运行指南

## 1. 环境要求

- Node.js >= 20
- npm >= 10

## 2. 安装依赖

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2
npm run install:all
```

## 3. 一键质量验证（发布前必跑）

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2
npm run verify:all
```

该命令会依次执行：

- 前端边界检查
- 前端类型检查
- 前端构建
- 前后端接口完备度报告生成
- 后端边界检查
- 后端类型检查
- 后端构建
- 后端契约测试

## 4. 开发模式

一键启动前后端（推荐）：

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2
npm run dev:stack:start
```

一键停止：

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2
npm run dev:stack:stop
```

前端：

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2
npm run dev
```

后端：

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2/backend
npm run dev
```

## 5. 生产启动

前端静态构建：

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2
npm run build
```

后端启动：

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2/backend
npm run build
npm run start
```

默认后端监听 `127.0.0.1:5055`。

可用环境变量：

- `PORT`：端口（默认 `5055`）
- `HOST`：监听地址（默认 `127.0.0.1`）
- `MODEL_FILE`：模型文件路径（默认 `v2/model.json`）
- `WORKSPACE_DATA_FILE`：工作区数据文件路径（默认 `v2/backend/data.json`）
- `LLM_API_BASE`：OpenAI 兼容接口地址（例如 `https://api.openai.com/v1`）
- `LLM_API_KEY`：大模型 API Key
- `LLM_MODEL`：模型名（默认 `gpt-4o-mini`）

## 6. 交付产物

- 前端：`/Users/zqs/Downloads/project/BuildWise/v2/dist`
- 后端：`/Users/zqs/Downloads/project/BuildWise/v2/backend/dist`
- 阶段报告：`/Users/zqs/Downloads/project/BuildWise/docs/milestones`
