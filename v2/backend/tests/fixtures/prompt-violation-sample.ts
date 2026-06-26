// check-prompt-quality 检测器回归测试 fixture
// 模拟 application 层 userPrompt 赋值的三种模式，验证检测器精准识别违规、不误报合规。

// 违规样本：userPrompt 直接拼入 JSON schema 字段名（schema 应通过 expectedOutput 传递）
export const violationSample = {
  expectedOutput: "JSON: {uxConstraints[],interactionFlows[]}",
  userPrompt: `上下文：示例\n请严格输出 JSON: {uxConstraints[],interactionFlows[],uiStates[]}`
};

// 合规样本：userPrompt 纯自然语言，schema 通过 expectedOutput 传递
export const compliantSample = {
  expectedOutput: "JSON: {uxConstraints[],interactionFlows[]}",
  userPrompt: "请基于上述上下文，输出可执行的 UX 约束、交互流程与界面状态。"
};

// 动态构造样本：函数构造的 userPrompt，检测器应跳过（仅扫字面量赋值）
export function buildDynamicUserPrompt(): string {
  return "请输出分析结论。";
}
export const dynamicSample = {
  userPrompt: buildDynamicUserPrompt()
};
