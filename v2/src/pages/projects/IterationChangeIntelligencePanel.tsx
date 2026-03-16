import type { Iteration, IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import {
  buildArtifactImpactHeadline,
  buildArtifactImpactSummary,
  buildChangeIntelligenceHeadline,
  buildChangeIntelligenceSummary
} from "./iterationChangeIntelligence";

type IterationChangeIntelligencePanelProps = {
  iteration: Iteration | null;
  artifactItems: IterationArtifactWorkflowItem[];
  onOpenArtifact: (artifactId: string) => void;
};

type ArtifactImpactPanelProps = {
  iteration: Iteration | null;
  artifact: IterationArtifactWorkflowItem | null;
};

function renderTagList(items: string[], className = "change-intelligence-tag") {
  if (items.length === 0) {
    return <p className="hint">暂无</p>;
  }
  return (
    <div className={className === "change-intelligence-tag" ? "change-intelligence-tag-list" : "artifact-impact-tag-list"}>
      {items.map((item) => (
        <span key={item} className={className}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function IterationChangeIntelligencePanel({
  iteration,
  artifactItems,
  onOpenArtifact
}: IterationChangeIntelligencePanelProps) {
  const summary = buildChangeIntelligenceSummary(iteration);
  if (!summary) {
    return null;
  }
  const impactedArtifacts = artifactItems.filter((item) => summary.impactedArtifactIds.includes(item.id));
  return (
    <details className="change-intelligence-panel" aria-label="变更映射与项目积累">
      <summary className="change-intelligence-summary">
        <div className="change-intelligence-head">
          <div>
            <h3>变更映射</h3>
            <p className="hint">{buildChangeIntelligenceHeadline(summary)}</p>
          </div>
          <span className="change-intelligence-source">{summary.sourceLabel}</span>
        </div>
        <span className="change-intelligence-summary-action">展开查看</span>
      </summary>
      {summary.rawInput ? <p className="change-intelligence-raw">{summary.rawInput}</p> : null}
      <div className="change-intelligence-grid">
        <section className="change-intelligence-block">
          <h4>功能点归一化</h4>
          {renderTagList(summary.normalizedFunctionalPoints)}
        </section>
        <section className="change-intelligence-block">
          <h4>项目知识命中</h4>
          {summary.knowledgeHits.length > 0 ? (
            <ul className="history-list compact">
              {summary.knowledgeHits.map((item) => (
                <li key={item} className="history-item">
                  <p>{item}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">暂无显式命中。</p>
          )}
        </section>
      </div>
      {summary.knowledgeConflicts.length > 0 ? (
        <section className="change-intelligence-block change-intelligence-warning">
          <h4>冲突与约束</h4>
          <ul className="history-list compact">
            {summary.knowledgeConflicts.map((item) => (
              <li key={item} className="history-item">
                <p>{item}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {(summary.attachments.length > 0 || summary.references.length > 0) ? (
        <div className="change-intelligence-grid">
          <section className="change-intelligence-block">
            <h4>输入附件</h4>
            {renderTagList(summary.attachments)}
          </section>
          <section className="change-intelligence-block">
            <h4>引用上下文</h4>
            {renderTagList(summary.references)}
          </section>
        </div>
      ) : null}
      {impactedArtifacts.length > 0 ? (
        <section className="change-intelligence-block">
          <div className="change-intelligence-artifact-head">
            <h4>受影响交付物</h4>
            <p className="hint">只展示当前变更链实际影响到的交付物。</p>
          </div>
          <div className="change-intelligence-artifact-list">
            {impactedArtifacts.map((item) => (
              <button key={item.id} type="button" className="change-intelligence-artifact-chip" onClick={() => onOpenArtifact(item.id)}>
                <strong>{item.title}</strong>
                <span>{item.stage}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </details>
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
