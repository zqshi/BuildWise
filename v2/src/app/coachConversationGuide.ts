/**
 * Coach conversation guide — builds natural-language follow-up messages from guidance signals.
 */

type CoachGuidance = {
  uploadRecommended: boolean;
  suggestedUploadTypes: string[];
  suggestedActions: string[];
  clarificationChecklist: string[];
};

type CoachFollowupInput = {
  intent: string;
  guidance: CoachGuidance;
};

export function buildCoachFollowupMessage(input: CoachFollowupInput): string {
  const { guidance } = input;
  const parts: string[] = [];

  if (guidance.uploadRecommended && guidance.suggestedUploadTypes.length > 0) {
    parts.push(`建议把相关材料传上来（${guidance.suggestedUploadTypes.join("、")}格式优先），方便我进一步分析。`);
  }

  if (guidance.suggestedActions.length > 0) {
    parts.push(`接下来可以重点推进：${guidance.suggestedActions.join("、")}。`);
  }

  if (guidance.clarificationChecklist.length > 0) {
    parts.push(`还需要确认以下问题：${guidance.clarificationChecklist.join("；")}。`);
  }

  return parts.join("\n");
}
