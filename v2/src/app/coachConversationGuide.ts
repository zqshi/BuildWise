import type { IterationCoachChatResponse } from "../domain/workspace/types";

function pickLines(input: string[] | undefined, limit: number) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

export function buildCoachFollowupMessage(
  coach: Pick<IterationCoachChatResponse, "intent" | "guidance">
) {
  const suggestedActions = pickLines(coach.guidance?.suggestedActions, 3);
  const clarificationChecklist = pickLines(coach.guidance?.clarificationChecklist, 2);
  const parts: string[] = [];
  if (coach.guidance?.uploadRecommended) {
    parts.push("建议先补充本轮材料（需求、原型或接口变更），我再基于真实上下文继续推进。");
  }
  if (suggestedActions.length > 0) {
    parts.push(`下一步可直接执行：${suggestedActions.join("；")}。`);
  }
  if (clarificationChecklist.length > 0) {
    parts.push(`本轮优先确认：${clarificationChecklist.join("；")}。`);
  }
  if (parts.length === 0) {
    return "";
  }
  return `继续推进建议：${parts.join("")}`;
}
