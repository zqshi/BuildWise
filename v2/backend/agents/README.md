# Agent Asset Registry

统一管理多 Agent 资产，支持“项目管理 Agent 驱动 + 专职 Agent 执行”的可扩展架构。

## 目录约定

- `catalog/`：Agent 清单（角色、职责、输入输出契约）。
- `prompts/`：Agent 提示词模板（`agent.<role>.v1|v2.md`）。
- `workflows/fixed/`：固定工作流模板（阶段顺序、执行循环）。
- `workflows/dynamic/`：动态工作流提示（按 scope 注入策略）。
- `function-prompts/`：可复用的功能提示词（任务拆解、代码审查等）。
- `adapters/`：外部 Agent 生态适配配置（如 Agent Scope 开源项目）。

## 兼容策略

运行时优先读取本目录；若提示词缺失，自动回退到 `v2/backend/prompts/`。
