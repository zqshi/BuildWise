import type { ProjectModelViewPayload } from "../../domain/workspace/modelOpsTypes";

export function buildProjectOpenclawContext(modelView: ProjectModelViewPayload | null) {
  if (!modelView) {
    return "";
  }
  const reviewTaskSummary = modelView.reviewTasks
    .slice(0, 3)
    .map((item) => `${item.blocking ? "阻断" : "待处理"}:${item.title}`)
    .join("；");
  const evidenceSummary = modelView.evidence.slice(0, 4).join("；");
  const blockingReviewTaskCount = modelView.reviewTasks.filter((item) => item.blocking).length;
  return [
    "[统一模型视图提示]",
    `项目=${modelView.projectName}`,
    `当前快照=${modelView.latestSnapshotId || "-"}；状态=${modelView.latestSnapshotStatus}`,
    `当前迭代=${modelView.iterationName || "-"}；状态=${modelView.iterationStatus}`,
    `待确认任务=${reviewTaskSummary || "-"}`,
    `证据=${evidenceSummary || "-"}`,
    `阻断任务数=${blockingReviewTaskCount}`
  ].join("\n");
}
