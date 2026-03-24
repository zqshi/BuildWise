# BuildWise 升级方案：断链修复与本体全流程贯穿

## 1. 文档调整说明

原始版本超过仓库治理上限，已拆分为一组可维护的专题文档。

保留本文件作为索引，避免历史引用完全失效。

## 2. 核心结论

本轮升级的目标不是重做产品，而是修复四类断链：

1. 主窗口策略无法稳定回写到项目执行。
2. Skill 定义、选择和执行链路不一致。
3. 技术本体、业务规则和知识沉淀没有形成闭环。
4. 全局对话、项目知识和迭代上下文没有稳定贯通。

升级后应满足：

1. 主窗口负责默认策略，不写死项目流程。
2. 每个项目一个独立 workspace。
3. 所有迭代在同一个项目 workspace 中持续沉淀知识。
4. BuildWise 侧维护项目知识库与检索，OpenClaw 继续负责 `agent + session + workspace + skills + history`。

## 3. 拆分后的文档

1. [01-现状与目标](/Users/zqs/Downloads/project/BuildWise/docs/50-upgrade/01-现状与目标.md)
   - 当前断链诊断
   - 目标架构
   - 升级边界
2. [02-策略与技能链路](/Users/zqs/Downloads/project/BuildWise/docs/50-upgrade/02-策略与技能链路.md)
   - 主窗口策略回写
   - Skill 定义、选择、执行的一致性
3. [03-本体与知识沉淀](/Users/zqs/Downloads/project/BuildWise/docs/50-upgrade/03-本体与知识沉淀.md)
   - 技术本体
   - 业务规则本体
   - 项目知识库与索引
4. [04-OpenClaw 集成与实施](/Users/zqs/Downloads/project/BuildWise/docs/50-upgrade/04-OpenClaw集成与实施.md)
   - 项目 workspace
   - session key
   - 分阶段实施与风险

## 4. 当前执行基线

后续治理以这两份设计为准：

1. [系统性治理升级设计](/Users/zqs/Downloads/project/BuildWise/docs/51-系统性治理升级设计.md)
2. [04-OpenClaw 集成与实施](/Users/zqs/Downloads/project/BuildWise/docs/50-upgrade/04-OpenClaw集成与实施.md)
