# BuildWise v2 Backend

## 快速开始

```bash
cd /Users/zqs/Downloads/project/BuildWise/v2/backend
npm install
npm run build
npm run start
```

开发模式：

```bash
npm run dev
```

## 质量门禁

```bash
npm run check:boundaries
npm run typecheck
npm run build
npm run test:contract
```

## 关键接口

- `GET /health`
- `GET /api/status`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id/iterations`
- `POST /api/projects/:id/iterations`
- `GET /api/model`
- `GET /api/model/entities`
- `POST /api/model/entities`
- `GET /api/rules/compile`
- `GET /api/rules/bind`
- `GET /api/sync/report`
- `GET /api/trace`
- `GET /api/trace/map`

## 配置

- 默认监听 `127.0.0.1:5055`
- `PORT` 可覆盖端口
- `HOST` 可覆盖监听地址
- `MODEL_FILE` 可覆盖模型文件路径
- `WORKSPACE_DATA_FILE` 可覆盖工作区数据路径
