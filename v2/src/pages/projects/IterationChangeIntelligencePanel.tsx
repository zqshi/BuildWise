import type { Iteration, IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import { buildArtifactImpactHeadline, buildArtifactImpactSummary } from "./iterationChangeIntelligence";

type ArtifactImpactPanelProps = {
  iteration: Iteration | null;
  artifact: IterationArtifactWorkflowItem | null;
};

function renderTagList(items: string[], className = "artifact-impact-tag") {
  if (items.length === 0) {
    return <p className="hint">暂无</p>;
  }
  return (
    <div className="artifact-impact-tag-list">
      {items.map((item) => (
        <span key={item} className={className}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function ArtifactImpactPanel({ iteration, artifact }: ArtifactImpactPanelProps) {
  const summary = buildArtifactImpactSummary(iteration, artifact);
  if (!summary) {
    return null;
  }
  return (
    <details className="artifact-impact-panel" aria-label="交付物映射上下文">
      <summary className="artifact-impact-summary">
        <div>
          <h4>本交付物映射上下文</h4>
          <p className="hint">{buildArtifactImpactHeadline(summary)}</p>
        </div>
        <span className="artifact-impact-summary-action">展开查看</span>
      </summary>
      <div className="artifact-impact-grid">
        <div>
          <span>输入来源</span>
          {renderTagList(summary.sourceTypes, "artifact-impact-tag")}
        </div>
        <div>
          <span>功能点</span>
          {renderTagList(summary.functionalPoints, "artifact-impact-tag")}
        </div>
        <div>
          <span>需求映射</span>
          {renderTagList(summary.requirementRefs, "artifact-impact-tag")}
        </div>
        <div>
          <span>组件映射</span>
          {renderTagList(summary.componentRefs, "artifact-impact-tag")}
        </div>
      </div>
      {summary.codePaths.length > 0 ? (
        <div className="artifact-impact-codepaths">
          <span>代码边界</span>
          {renderTagList(summary.codePaths, "artifact-impact-tag")}
        </div>
      ) : null}
    </details>
  );
}
