# 代码评审功能提示词

输入：代码变更摘要、风险清单、验收标准。
输出：
- findings[]
- regressions[]
- releaseBlockers[]
- goNoGoDecision

约束：
1. 结论必须绑定证据路径。
2. 高风险项必须包含处置建议。
3. 无法确认项必须进入 unknowns[]。
