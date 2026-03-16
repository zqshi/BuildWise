import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachFollowupMessage } from "../src/app/coachConversationGuide.ts";

test("buildCoachFollowupMessage returns empty string when no guidance signals", () => {
  const message = buildCoachFollowupMessage({
    intent: "general",
    guidance: {
      uploadRecommended: false,
      suggestedUploadTypes: [],
      suggestedActions: [],
      clarificationChecklist: []
    }
  });
  assert.equal(message, "");
});

test("buildCoachFollowupMessage composes natural-language followup", () => {
  const message = buildCoachFollowupMessage({
    intent: "clarify",
    guidance: {
      uploadRecommended: true,
      suggestedUploadTypes: ["markdown"],
      suggestedActions: ["确认边界范围", "补齐验收口径"],
      clarificationChecklist: ["是否包含回滚策略"]
    }
  });
  assert.match(message, /继续推进建议：/);
  assert.match(message, /先补充本轮材料/);
  assert.match(message, /确认边界范围/);
  assert.match(message, /是否包含回滚策略/);
});
