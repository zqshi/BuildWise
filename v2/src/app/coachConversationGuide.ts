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
    parts.push("如果方便的话，先把相关材料传上来（需求文档、原型或者接口变更），我看着实际内容聊会更靠谱。");
  }
  if (suggestedActions.length > 0) {
    parts.push(`接下来可以做的：${suggestedActions.join("；")}。`);
  }
  if (clarificationChecklist.length > 0) {
    parts.push(`有几个点需要先确认一下：${clarificationChecklist.join("；")}。`);
  }
  if (parts.length === 0) {
    return "";
  }
  return parts.join("");
}
