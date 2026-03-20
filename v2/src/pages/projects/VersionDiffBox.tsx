import type { AttachmentAnalysisReport } from "./iterationWorkspacePanelTypes";

export type VersionDiffBoxProps = {
  hasBaselineComparison: boolean;
  analysisReport: AttachmentAnalysisReport;
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  diffAdded: string[];
  diffChanged: string[];
  diffRemoved: string[];
};

export function VersionDiffBox({
  hasBaselineComparison,
  analysisReport,
  diffLocations,
  diffAdded,
  diffChanged,
  diffRemoved,
}: VersionDiffBoxProps) {
  if (hasBaselineComparison) {
    return (
      <>
        <div className="info-box">
          <h3>版本差异（对比上个版本）</h3>
          <p>基线版本：{analysisReport.versionDiff.baselineIterationName}</p>
          <p>新增：{diffAdded.join("、") || "无"}</p>
          <p>变化：{diffChanged.join("、") || "无"}</p>
          <p>移除：{diffRemoved.join("、") || "无"}</p>
        </div>
        <div className="info-box">
          <h3>差异定位（与上个版本）</h3>
          {diffLocations.length === 0 ? (
            <p>未检测到结构化差异。</p>
          ) : (
            <ul className="history-list">
              {diffLocations.map((item, index) => (
                <li key={`${item.dimension}-${item.changeType}-${item.currentItem}-${index}`} className="history-item">
                  <strong>{item.dimension}</strong>
                  <p>
                    {item.changeType === "added" ? "新增" : item.changeType === "removed" ? "移除" : "变更"}：
                    {item.baselineItem ? `${item.baselineItem} -> ` : ""}
                    {item.currentItem}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="info-box">
      <h3>版本差异（对比上个版本）</h3>
      <p className="hint">当前为首个版本或无可比较基线。</p>
    </div>
  );
}
