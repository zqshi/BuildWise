# Iteration Ontology And Impact Contract

## 目标
把迭代内“提出需求点或修改点”收敛为一条可控链路：

1. 选择或提出功能点
2. 建立需求本体与映射候选
3. 分析影响边界
4. 锁定可执行边界
5. 只允许在边界内生成和推进交付物

平台负责存储、门禁、审计与边界校验；OpenClaw 负责理解上下文、调用 skills、生成映射与建议。

## 适用场景
1. 首版本：从 0 到 1 建立需求本体、组件映射和初始边界。
2. 后续版本：对增量功能点或需求修改执行继承差异确认、映射重算与影响分析。
3. 局部修改：用户在迭代中新增、删除、替换某个功能点时，必须重新映射并重算边界。

## 核心原则
1. 任何开发、原型、测试、发布动作都不能绕过映射与边界。
2. 任何高风险修改都必须先产出 `requirementRefs/componentRefs/codePaths` 三向边界。
3. 没有映射证据的功能点不能进入可发布状态。
4. Agent 可以自行编排 skills，但不能跳过 `01-ontology-mapping` 和 `02-impact-analysis` 的最小结果要求。
5. 映射入口必须支持多种输入方式，不能只依赖“功能点点选”。
6. 每个项目都必须在自己的 workspace 内持续沉淀知识，Agent 的项目理解应随迭代持续增强。

## 交互阶段

### 1. 修改触发与需求提出
触发来源：
1. 用户在会话中自然语言提出功能点
2. 用户上传需求文档、HTML、截图、代码变更说明
3. 用户在后续版本中声明“修改某功能”
4. 用户在界面中直接点选功能点、模块、页面或交付物
5. 用户引用历史交付物、历史消息或历史版本结论

前端最小交互：
1. 主会话保留原始输入
2. 迭代面板生成候选“功能点标签”与“修改源类型”
3. 用户可继续补充说明，但不直接手填边界
4. 当输入来自文档/HTML/图片时，必须保留对应原始材料引用
5. 当输入来自点选时，必须保留被选中的页面、组件或历史交付物引用

Agent 动作：
1. 提炼需求语义
2. 切分为功能点/约束/排除项/待确认点
3. 识别输入来源是自然语言、文档、图片、HTML 还是显式点选
4. 将统一后的功能点传给 `01-ontology-mapping`

### 1.1 多模态输入归一化
所有输入方式都必须先归一化为同一份映射输入，不允许各走各的私有链路。

归一化后的统一载荷建议包括：
1. `changeSource.type`
2. `changeSource.rawInput`
3. `changeSource.attachments`
4. `functionalPoints`
5. `constraints`
6. `exclusions`
7. `clarificationQuestions`

`changeSource.type` 取值建议：
1. `natural-language`
2. `document`
3. `html`
4. `image`
5. `selection`
6. `history-reference`

规则：
1. 如果用户只是自然语言表达，Agent 负责拆出功能点。
2. 如果用户提交文档/HTML/图片，Agent 先做内容理解，再拆功能点。
3. 如果用户使用点选，平台只提供显式锚点，不替 Agent 决定最终功能点语义。
4. 不管来源是什么，后续都必须进入同一条映射与影响分析链。

### 2. 本体映射候选
目标：把功能点映射到业务能力、组件、代码路径、测试验证单元。

技能：
1. `01-ontology-mapping`

输入：
1. `requirements`
2. `repo_metadata`
3. `code_index`
4. 当前迭代上下文
5. 基线版本上下文（后续版本必传）

输出最小契约：
1. `requirementToComponent`
2. `componentToCode`
3. `requirementToCode`
4. `mappingConfidence`
5. `unmappedRequirements`
6. `conflicts`
7. `gaps`

前端需要呈现：
1. 当前功能点
2. 映射到的组件
3. 映射到的代码路径
4. 缺口与冲突
5. 当前映射置信度
6. 本轮映射来源（自然语言/文档/图片/HTML/点选）

### 3. 影响分析
目标：回答“改这个功能到底会影响什么，风险在哪，最小改动集是什么”。

技能：
1. `02-impact-analysis`
2. 后续版本追加 `04-cross-iteration`

输入：
1. `change_events`
2. `ontology_map`
3. `dependency_graph`
4. 基线版本交付物与快照

输出最小契约：
1. `impactScope`
2. `risk`
3. `minimalExecutableActions`
4. `affectedArtifacts`
5. `regressionFocus`
6. `need_user_input` 或 `blockingQuestions`

前端需要呈现：
1. 影响模块
2. 影响交互
3. 影响代码路径
4. 影响测试点
5. 是否触发发布风险

### 4. 边界确认
目标：把候选映射收敛为真正可执行边界。

锁定字段：
1. `requirementRefs`
2. `componentRefs`
3. `codePaths`
4. `boundary.note`

确认规则：
1. `requirementRefs/componentRefs/codePaths` 三者至少各有一项，才算边界 ready
2. 高风险修改如果存在 `unmappedRequirements` 或 `conflicts`，不能进入开发阶段
3. 后续版本必须显式给出 `unchanged` 范围

Agent 动作：
1. 根据映射与影响分析提出边界建议
2. 让用户只确认“做什么/不做什么”
3. 不要求用户手写技术路径，平台只允许修正，不要求从零填写
4. 如果用户继续补充自然语言、重新上传文档或调整图片/HTML，必须重新触发映射重算

### 5. 交付物收敛
一旦边界确认完成，后续交付物必须只围绕边界生成：

1. `analysis-report`
只写本轮功能点、约束、排除项、风险与待确认项

2. `product-requirements-doc`
只写本轮范围相关的用户场景、功能需求、验收标准

3. `prototype-preview`
只允许展示受影响页面和交互

4. `design-spec`
只允许说明受影响区域的视觉与交互规则

5. `technical-architecture`
只允许说明受影响模块、数据流、接口边界、回滚点

6. `code-delivery`
只允许说明边界内的新增、修改、继承不变项

7. `test-matrix`
必须覆盖本轮新增点 + 回归风险点

8. `release-review`
必须使用边界覆盖率和映射覆盖率参与评审

## 首版本与后续版本差异

### 首版本
1. 建立初始本体
2. 第一次形成 `requirement -> component -> code` 链路
3. 没有 `baseline_iteration`
4. 没有继承差异确认
5. 同时建立项目级 workspace 知识底座

### 后续版本
1. 继承基线本体
2. 只对新增/修改/删除的功能点重算映射
3. 必须输出 `unchanged` 范围
4. 必须输出回归关注点
5. 必须把本轮新增理解沉淀回项目 workspace

## 项目级持续积累
每个项目对应一个 workspace。OpenClaw 对项目的理解不能只停留在单个迭代内，必须持续积累。

项目 workspace 至少应沉淀：
1. 项目本体词典
2. 稳定业务规则
3. 长期组件清单
4. 常见代码路径映射
5. 已确认的排除项
6. 历史风险与回滚经验
7. 历史发布门禁结论
8. 关键术语与别名

建议模型：
1. `projectKnowledgeBase`
2. `projectOntologyTerms`
3. `projectComponentInventory`
4. `projectCodeMap`
5. `projectDecisionLog`
6. `projectKnownRisks`
7. `projectChangePatterns`

工作方式：
1. 首版本建立项目级初始知识。
2. 每次迭代确认后，把新功能点、边界、风险、回滚结论回写到项目 workspace。
3. 后续版本优先使用项目 workspace 作为理解基线，而不是每次只靠当前对话临时理解。
4. 当新输入与项目既有认知冲突时，Agent 必须显式指出冲突并要求确认。

## 双维建模补充
除了工程本体映射，还必须显式建模业务规则维度。

### 工程本体维度
目标：
1. 明确系统怎么实现
2. 明确改哪里会影响哪里

对象包括：
1. 页面与表面
2. 组件与模块
3. API 与数据结构
4. 状态机与流程节点
5. 代码路径
6. 测试对象

### 业务规则维度
目标：
1. 让业务人员通过自然语言持续灌入领域知识
2. 不要求业务人员直接改实现细节

对象包括：
1. 领域术语
2. 决策条件
3. 业务约束
4. 例外规则
5. 合规要求
6. 验收口径

### 关联要求
1. 原型和实现存在后，新增业务规则必须触发 `10-business-rule-linking`
2. 业务规则必须被关联到：
   - 页面
   - 组件
   - 接口
   - 状态机
   - 测试
3. 如果规则已改变但测试矩阵没有覆盖，不能进入发布判断

## 前端状态契约
迭代页建议增加一组显式状态：

1. `selectedFunctionalPointIds`
2. `mappingCandidates`
3. `mappingConfirmed`
4. `impactAnalysisSummary`
5. `boundaryReady`
6. `affectedArtifactIds`
7. `mappingAuditTrail`
8. `changeSource`
9. `projectKnowledgeHits`
10. `projectKnowledgeConflicts`

说明：
1. `selectedFunctionalPointIds` 表示当前用户或 Agent 正在推进的功能点集合
2. `mappingCandidates` 表示当前轮候选映射结果
3. `mappingConfirmed` 表示是否已锁定成正式边界
4. `affectedArtifactIds` 用于控制抽屉和卡片只展示受影响交付物
5. `changeSource` 标识本轮修改来自自然语言、文档、图片、HTML、点选或历史引用
6. `projectKnowledgeHits` 标识当前输入命中了哪些项目级已知知识
7. `projectKnowledgeConflicts` 标识当前输入与项目既有认知冲突的部分

## 后端输入输出契约

### 输入
1. `requirements`
2. `baseline_iteration_id`
3. `component_inventory`
4. `repository_index`
5. `dependency_graph`
6. `uploaded_materials`
7. `change_source`
8. `project_knowledge_base`

### 输出
1. `traceabilityMap`
2. `traceabilitySnapshot`
3. `boundary`
4. `versionDiffDetailed`
5. `releaseReview.qualitySignals.boundaryCoverage`
6. `lastTraceabilityCoverageScore`
7. `knowledgeHits`
8. `knowledgeConflicts`
9. `normalizedFunctionalPoints`

## 阻断条件
以下任一满足时，不允许进入发布：
1. `boundary.requirementRefs/componentRefs/codePaths` 不完整
2. `traceabilityCoverage < 40`
3. 存在高风险功能点但 `mappingConfidence=low`
4. 存在 `unmappedRequirements`
5. 发布变更超出 `codePaths` 白名单
6. 当前输入与项目级稳定规则冲突且未经确认

## 审计字段
每次功能点修改都应留下：
1. 触发输入
2. 映射前结果
3. 映射确认结果
4. 影响分析结论
5. 边界锁定结果
6. 受影响交付物
7. 最终发布或阻断原因
8. 本轮命中的项目知识
9. 本轮修正了哪些项目知识

## 当前实现状态
已具备：
1. `traceabilityMap` 模型
2. `boundary` 模型
3. 边界白名单校验
4. traceability 覆盖率参与质量门禁
5. mock 数据中的 `traceabilitySnapshot`
6. 项目与 workspace 的绑定能力
7. 迭代内 `domainKnowledgeEntries` 存储位

仍需补齐：
1. 前端多模态修改入口的统一状态层
2. 前端“映射确认”面板
3. 每次需求修改后自动触发映射重算
4. 项目级知识库的显式读写与冲突提示
5. 交付物列表按 `affectedArtifactIds` 收敛
6. 审计面板直接回放“功能点 -> 映射 -> 边界 -> 交付物”链路

## 建议实施顺序
1. 建立多模态 `changeSource` 统一归一化层
2. 让 OpenClaw 在每次需求修改后输出 `mappingCandidates + impactSummary + knowledgeHits/conflicts`
3. 补前端“映射确认”面板
4. 锁边界后只展示受影响交付物
5. 建立项目级 workspace 知识沉淀与冲突提示
6. 发布前强校验 `boundary + traceabilityCoverage + changedPaths`
