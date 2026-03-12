# IM与Agent协作执行时序图（现状与目标）

> 目的：沉淀 IM 场景下“人 + Agent”协作闭环，作为后续实现与对齐基准。

## 1. 当前实现时序图（As-Is）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant IM as IM对话
    participant WS as WorkspaceService（系统编排）
    participant Coach as iteration-coach（迭代教练Agent）
    participant Analyzer as 分析Agent组（多Agent）
    participant BG as boundary-guardian（边界守卫Agent）
    participant UX as ux-designer（UX Agent）
    participant FE as frontend-developer（前端开发Agent）
    participant BE as backend-developer（后端开发Agent）
    participant QA as qa-reviewer（质量评审Agent-测试产物）
    participant RR as 发布评审引擎（规则）
    participant DE as delivery-engineer（交付工程Agent-交付包）
    participant FS as 仓库文件系统

    U->>IM: 上传附件/输入需求
    IM->>WS: analyzeAttachment
    WS->>Analyzer: 多Agent分析
    Analyzer-->>WS: 分析结果/澄清问题/质量信号
    WS->>BG: 边界建议提取
    BG-->>WS: requirement/component/codePaths
    WS-->>IM: 返回分析报告（待确认）

    loop 人机澄清
        U->>IM: 补充目标/边界/验收
        IM->>WS: agent-chat
        WS->>Coach: 意图识别与引导
        Coach-->>WS: reply + execution.action
        WS-->>IM: 引导回复/下一步动作
    end

    alt 确认理解准确
        IM->>WS: confirmIterationAnalysis(accurate=true)
        WS-->>IM: 确认完成，边界锁定
    else 理解不准确
        IM->>WS: confirmIterationAnalysis(accurate=false)
        WS-->>IM: 回到澄清模式
    end

    opt 触发 full-cycle
        IM->>WS: runIterationFullCycle
        WS->>UX: 生成 UX 约束与交互提示
        UX-->>WS: UX 规格摘要
        WS->>FE: 前端边界内改写(JSON edits)
        FE-->>WS: 前端改写结果
        WS->>BE: 后端边界内改写(JSON edits)
        BE-->>WS: 后端改写结果
        WS->>FS: 统一落盘代码（越界阻断）

        WS->>QA: 生成测试产物(JSON)
        QA-->>WS: unit/contract/acceptance/regression
        WS->>FS: 落盘测试产物

        WS->>RR: 发布评审(go/caution/block)
        RR-->>WS: decision/score/blockers

        WS->>DE: 生成交付包(JSON)
        DE-->>WS: reviewReport/readme/manifest/env
        WS->>FS: 落盘评审报告与交付包
        WS-->>IM: 返回闭环结果+产物路径
    end
```

## 2. 目标时序图（To-Be，显式 FE/BE + UX）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant IM as IM对话
    participant WS as WorkspaceService（系统编排）
    participant Coach as iteration-coach（迭代教练Agent）
    participant UX as ux-designer（UX Agent，目标新增）
    participant BG as boundary-guardian（边界守卫Agent）
    participant FE as frontend-developer（前端开发Agent）
    participant BE as backend-developer（后端开发Agent）
    participant QA as qa-reviewer（质量评审Agent）
    participant DE as delivery-engineer（交付工程Agent）
    participant RR as 发布评审引擎（规则）
    participant FS as 仓库文件系统

    U->>IM: 输入业务目标/上传原型
    IM->>WS: analyzeAttachment + agent-chat
    WS->>Coach: 澄清引导
    Coach-->>WS: 澄清问题与确认建议

    WS->>UX: 生成信息架构/交互流程/可用性约束
    UX-->>WS: UX规格（页面结构、流程、状态、文案）

    WS->>BG: 校验并锁定边界
    BG-->>WS: 白名单边界

    WS->>FE: 基于UX规格生成前端实现
    FE-->>WS: 前端改写计划与代码
    WS->>BE: 基于需求与边界生成后端实现
    BE-->>WS: 后端改写计划与代码
    WS->>FS: 统一落盘（边界门禁）

    WS->>QA: 基于UX+FE+BE产物生成测试矩阵
    QA-->>WS: 测试与验收产物
    WS->>RR: 发布评审
    RR-->>WS: go/caution/block

    WS->>DE: 生成可部署交付包
    DE-->>WS: 部署清单+回滚方案+交付说明
    WS->>FS: 落盘交付包
    WS-->>IM: 输出评审报告与交付物路径
```

## 3. 节点映射（中文）

- `iteration-coach`：迭代教练Agent
- `boundary-guardian`：边界守卫Agent
- `frontend-developer`：前端开发Agent
- `backend-developer`：后端开发Agent
- `qa-reviewer`：质量评审Agent
- `delivery-engineer`：交付工程Agent
- `WorkspaceService`：系统编排层（非Agent）
- `发布评审引擎`：规则评审模块（非Agent）
- `仓库文件系统`：执行落盘模块（非Agent）
- `ux-designer`：UX Agent（已落地）

## 4. 关键实现定位（便于后续开发）

- IM 引导入口：`v2/backend/src/interfaces/http/routes/workspaceIterationCoreRoutes.ts`
- 教练Agent编排：`v2/backend/src/application/workspace/workspaceServiceCoachOps.ts`
- Full-cycle 主流程：`v2/backend/src/application/workspace/workspaceService.ts`
- 边界内改写：`v2/backend/src/application/workspace/workspaceServiceCodeRewriteOps.ts`
- 测试产物/交付包生成：`v2/backend/src/application/workspace/workspaceServiceQualityOps.ts`
- 边界确认与门禁：`v2/backend/src/application/workspace/workspaceServiceChangeControlOps.ts`

## 5. 当前与目标差距（摘要）

1. Full-cycle 已形成 UX 约束注入 + FE/BE 双泳道改写，并保留 delivery-engineer 兜底。
2. `ux-designer` 已在角色枚举、提示词与执行链中落地。
3. 测试产物与交付包支持 Agent 优先生成，并保留失败降级。
