import type { ProjectModelViewPayload } from "../../domain/workspace/modelOpsTypes";
import { buildModelOperationalSignals } from "./projectModelViewAdapter";

export function buildProjectOpenclawContext(modelView: ProjectModelViewPayload | null) {
  if (!modelView) {
    return "";
  }
  const signals = buildModelOperationalSignals(modelView);
  return [
    "[统一模型视图提示]",
    `项目=${modelView.projectName}`,
    `当前快照=${modelView.latestSnapshotId || "-"}；状态=${modelView.latestSnapshotStatus}`,
    `当前迭代=${modelView.iterationName || "-"}；状态=${modelView.iterationStatus}`,
    `待确认任务=${signals.reviewTaskSummary || "-"}`,
    `证据=${signals.evidenceSummary || "-"}`,
    `阻断任务数=${signals.blockingReviewTaskCount}`
  ].join("\n");
}
