/**
 * Coach guidance builder — derives actionable guidance items from analysis report.
 */

export type CoachGuidanceItem = {
  label: string;
  text: string;
  type: "action" | "info" | "warning";
  icon: "alert" | "chat" | "check" | "info";
};

export function buildCoachGuidance(
  _analysisReport: unknown,
  _reportPendingConfirmation: boolean
): CoachGuidanceItem[] {
  return [];
}
