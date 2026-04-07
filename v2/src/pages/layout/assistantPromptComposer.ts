/**
 * Assistant prompt composer — composes prompts for global and project assistant windows.
 */

export type AssistantDialogMode = "native" | "orchestration";

export function composeAssistantGlobalMessage(userInput: string, mode: AssistantDialogMode): string {
  const trimmed = userInput.trim();
  if (mode === "native") {
    return trimmed;
  }
  return [
    "[业务助手主窗口编排约束]",
    "- skills 采用渐进式加载，按需注入当前任务所需的 skill 子集",
    "- 由 Agent 根据问题自行编排执行流程",
    "",
    `用户请求：${trimmed}`
  ].join("\n");
}

export function composeAssistantProjectMessage(userInput: string, mode: AssistantDialogMode): string {
  const trimmed = userInput.trim();
  if (mode === "native") {
    return trimmed;
  }
  return [
    "[业务助手项目窗口策略约束]",
    "- 由 Agent 根据问题自行编排执行流程",
    "- 项目级策略模板自动注入",
    "",
    `用户请求：${trimmed}`
  ].join("\n");
}
