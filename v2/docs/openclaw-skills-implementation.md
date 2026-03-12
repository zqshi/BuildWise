# OpenClaw + Skills 落地方案（BuildWise）

## 1. 目标与边界
- 目标：采用单 Agent + skills，构建可治理、可追溯、可跨版本继承的研发闭环。
- 运行模式：优先 OpenClaw Runtime；不可用时走 BuildWise OpenClaw Bridge（不改业务治理语义）。
- 约束：
  - 本地 OpenClaw 源码路径锁定为只读参考：`/Users/zqs/Downloads/project/dependencies/openclaw`
  - 禁止修改该路径下代码。
  - 当前项目作为应用宿主，可持续迭代。

## UI 分层约束（2026-03-11）
- OpenClaw 主窗口定位为“对话式流程编排配置中心”，只用于：
  - 流程模板/门禁策略编排与发布
  - OpenClaw 集成状态检查
  - 项目 workspace 入口分发
- OpenClaw 主窗口禁止用于推进具体项目流程（不在此处执行项目引导对话）。
- 当前阶段采用全局统一编排逻辑，不做项目维度差异化流程配置。
- 每个项目对应一个 OpenClaw workspace，项目引导仅在项目窗口生效。
- 项目引导必须聚焦到迭代版本（iteration）上下文执行。

## 2. 本体与治理骨架
- 本体层（What）
  - 需求节点：目标、约束、验收标准
  - 代码节点：模块、接口、关键路径
  - 交付物节点：分析报告、边界确认、测试矩阵、发布评审等
  - 关系：需求->组件->代码->测试->发布
- 治理层（How）
  - 状态机：planned -> in-progress -> review -> completed/blocked
  - 门禁：关键交付物必须 draft -> commit -> confirm -> add-to-chat
  - 人工确认：首版 Git 分析报告必须确认后推进
  - 异常分支：同步失败、测试阻断、输入不足

## 3. Skills 编排
- 主技能：`00-orchestrator-sop`
  - 决策阶段推进、触发子技能、决定是否阻断/澄清。
- 子技能：
  - `01-ontology-mapping`：构建需求-组件-代码映射
  - `02-impact-analysis`：计算影响面与风险
  - `03-deliverable-governance`：交付物生命周期治理
  - `04-cross-iteration`：跨版本继承与差异
  - `05-exception-recovery`：异常检测与恢复对话
  - `06-quality-release-gate`：质量与发布门禁
  - `07-audit-trace`：审计留痕与可回放

## 4. OpenClaw 集成
- 配置文件：`v2/backend/openclaw/runtime.config.json`
- 关键能力：
  - `sourceRegistry`：项目源码路径 + 锁定版本（支持多项目）
  - `runtimeMode`：openclaw-native / bridge
  - `skillsRoot`：BuildWise skills 清单路径
- 源码路径锁定用途：
  - 锁定某个项目版本作为分析基线。
  - 将同一套 skills 应用于其他项目时，复用同一治理框架。

## 5. 真实演练链路
- 脚本：`v2/scripts/run-openclaw-skills-drill.mjs`
- 演练目标：
  1. 首版：Git 读取 -> 分析报告待确认 -> 全链路交付
  2. 二版：跨版本继承/新增对照
  3. 三版：同步失败异常分支与恢复
- 输出证据：`v2/backend/.runtime/recordings/openclaw-skills-drill-*.json`

## 6. 验收标准
- 仅 1 个项目，且仅 3 个迭代。
- 每个迭代都有交付物引用消息并可点击。
- 首版必须存在“Git分析报告待确认 -> 确认”对话。
- 二版必须存在跨版本差异确认。
- 三版必须存在异常告警与恢复确认。
- 全链路有审计字段：status/summary/artifacts/questions/risks/next_actions/evidence。
