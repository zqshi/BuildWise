# 追溯模型（Trace Model）

## 目的

定义 BuildWise 中“需求、规则、模型、交付物、测试、代码、发布结论”之间的统一追溯结构，保证影响分析、测试覆盖和发布门禁都有明确证据链。

## 范围

本文档负责：

- 追溯对象定义
- 追溯链路设计
- 追溯记录结构
- 覆盖率与门禁规则

本文档不负责：

- 代码注释实现细节
- 具体 AST 解析器实现
- 具体 UI 展示样式

## 关键结论

1. BuildWise 的追溯不是“模型节点到代码片段”的单跳映射，而是“需求到发布”的多跳证据链。
2. 最关键的三类锚点是：`requirementRef`、`componentRef`、`codePath`。
3. 发布评审必须基于追溯覆盖率，而不是只基于主观建议。
4. 追溯链必须支持自动生成与人工补充并存。

## 1. 为什么需要追溯模型

没有追溯模型时，平台只能输出“看起来合理”的分析，无法回答以下高价值问题：

- 这条需求到底改了哪些页面和代码
- 哪些测试已经覆盖这次变更
- 哪些发布阻断项来自哪条规则或验收标准
- 本次发布结论是否真的有证据支撑

追溯模型的目标就是把这些问题结构化。

## 2. 追溯对象

### 2.1 上游对象

- 需求项
- 验收标准
- 业务规则
- 澄清问题及其确认结论

### 2.2 中游对象

- 实体
- 页面
- 组件
- API
- 交付物
- 测试用例

### 2.3 下游对象

- 代码路径
- 文件片段
- 提交记录
- 发布评审
- 部署记录

## 3. 追溯主链

理想追溯主链如下：

1. `Requirement`
2. `Boundary`
3. `Model Node`
4. `Artifact`
5. `Test Case`
6. `Code Link`
7. `Release Review`
8. `Deployment`

该链路至少要回答：

- 需求影响了什么
- 团队产出了什么
- 如何验证了它
- 为什么能发或不能发

## 4. 核心锚点

### 4.1 Requirement Ref

作用：

- 标识需求来源
- 连接验收标准与边界确认

来源：

- 需求文档编号
- 分析阶段自动生成的条目
- 用户确认时补充的 requirement ref

### 4.2 Component Ref

作用：

- 标识受影响页面、组件或业务交互面

来源：

- 项目建模视图
- 分析阶段自动识别
- 人工确认补充

### 4.3 Code Path

作用：

- 标识实现落点
- 连接代码、测试与发布

来源：

- 仓库路径
- 分析结果
- 代码绑定结果

## 5. 追溯记录结构

最小追溯记录应包含：

- `traceId`
- `projectId`
- `iterationId`
- `sourceRef`
- `targetRef`
- `relationType`
- `confidence`
- `source`
- `evidence`
- `createdAt`
- `updatedAt`

### 5.1 sourceRef 结构

```json
{
  "type": "requirement | acceptance | rule | entity | component | artifact | test | code | review | deployment",
  "id": "string"
}
```

### 5.2 targetRef 结构

```json
{
  "type": "same as sourceRef.type",
  "id": "string"
}
```

### 5.3 relationType 枚举

- `impacts`
- `implements`
- `verifies`
- `blocks`
- `derived_from`
- `references`
- `releases`

### 5.4 source 枚举

- `auto`
- `manual`
- `confirmed`

## 6. 关键追溯视图

### 6.1 需求影响视图

目标：

- 展示 requirement -> component -> codePath

适合用于：

- 分析确认
- 范围收敛

### 6.2 测试覆盖视图

目标：

- 展示 acceptanceCriteria -> testCase -> executionStatus

适合用于：

- QA 执行
- 发布前检查

### 6.3 发布证据视图

目标：

- 展示 requirement/boundary/test/review/deployment 的关系

适合用于：

- release review
- 复盘

## 7. 追溯覆盖率指标

平台至少要能计算以下指标：

1. 需求覆盖率
   定义：已有 requirementRef 的需求中，被映射到 component 或 codePath 的比例

2. 验收覆盖率
   定义：验收标准中，被映射到测试矩阵并执行的比例

3. 测试执行覆盖率
   定义：测试矩阵中，已执行的测试比例

4. 发布证据完整度
   定义：边界、测试、评审是否齐备

## 8. 发布门禁中的追溯规则

发布评审至少要检查：

1. 是否存在 requirementRef
2. 是否确认了 boundary
3. 是否存在测试矩阵
4. 验收标准是否被测试矩阵覆盖
5. 是否存在代码路径或实现引用

当以下条件成立时应考虑 `block`：

- 需求无有效边界
- 验收标准未覆盖
- 关键 requirement 无对应测试
- 关键 blocker 无法追溯来源

## 9. 追溯生成策略

### 9.1 自动生成

来源：

- 分析服务
- 建模视图
- 代码链接
- 测试矩阵生成

### 9.2 人工补充

来源：

- 分析确认
- 边界确认
- 交付物提交
- QA 更新

### 9.3 原则

自动生成负责“先搭骨架”；  
人工补充负责“把发布需要的证据补完整”。

## 10. 代码级追溯

代码级追溯至少支持两层：

1. 文件级
2. 片段级或符号级

最小结构：

- `file`
- `symbol`
- `start`
- `end`
- `branch/tag/commit`

说明：

片段级追溯是增强能力，不是主链唯一依赖。  
对于当前平台，文件级 + 路径级追溯已足以支撑大部分边界与发布门禁。

## 11. 存储与索引建议

追溯信息建议至少分为两类存储：

1. 状态存储中的结构化关系
2. 项目 workspace 中的可读知识与索引

这意味着：

- 运行时做判断时从结构化状态读
- Agent 做召回时从 `.buildwise/` 检索

## 12. In Scope

1. 需求到发布的多跳追溯链
2. requirement/component/code 三向边界
3. 测试与发布证据追溯

## 13. Out Of Scope

1. 通用静态分析平台
2. 对所有语言都做精细 AST 自动锚点
3. 脱离项目模型的独立追溯数据库设计

## 14. 与其他文档的边界

相关文档：

- [20-统一项目模型设计.md](./20-统一项目模型设计.md)
- [20-技术架构设计（执行版）.md](./20-技术架构设计（执行版）.md)
- [10-产品顶层设计（执行版）.md](./10-产品顶层设计（执行版）.md)

本文档不负责：

- 模型主对象定义
- DDD 目录规范
- 测试门禁全量规则
