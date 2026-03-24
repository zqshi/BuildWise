import { normalizeInlineMarkdownText } from "./projectOverviewPanelHelpers";
import type { ModelEntityCard, ModelRuleMapping } from "./projectModelBusinessView";
import type { ProjectModelBusinessSummaryPayload } from "../../domain/workspace/modelOpsTypes";

type Props = {
  relationTypeStats: Array<{ name: string; count: number }>;
  relationFocusEntities: string[];
  businessSummary: ProjectModelBusinessSummaryPayload | null;
  summaryGeneratedAtText: string;
  businessSummaryLoading: boolean;
  businessSummaryError: string;
  domainRuleDescriptions: string[];
  entityCards: ModelEntityCard[];
  ruleMappings: ModelRuleMapping[];
  relationNarratives: Array<{ id: string; title: string; meaning: string }>;
  displayedModelEntityCount: number;
  displayedModelRelationsCount: number;
  displayedModelRuleCount: number;
};

export function ProjectOverviewPanelModelSummary({
  relationTypeStats,
  relationFocusEntities,
  businessSummary,
  summaryGeneratedAtText,
  businessSummaryLoading,
  businessSummaryError,
  domainRuleDescriptions,
  entityCards,
  ruleMappings,
  relationNarratives,
  displayedModelEntityCount,
  displayedModelRelationsCount,
  displayedModelRuleCount
}: Props) {
  return (
    <>
      <div className="info-box">
        <h3>建模明细（关系与实体）</h3>
        <div className="project-summary-kpis project-model-detail-kpis">
          <div className="doc-item">
            <span>关系类型</span>
            <strong>{relationTypeStats.length}</strong>
          </div>
          <div className="doc-item">
            <span>关键实体</span>
            <strong>{relationFocusEntities.length}</strong>
          </div>
          <div className="doc-item">
            <span>关系总量</span>
            <strong>{displayedModelRelationsCount}</strong>
          </div>
          <div className="doc-item">
            <span>规则覆盖</span>
            <strong>{displayedModelRuleCount}</strong>
          </div>
        </div>
        {relationTypeStats.length === 0 ? (
          <p className="hint">暂无关系类型分布，当前未沉淀实体关系。</p>
        ) : (
          <ul className="project-highlight-list project-model-detail-list">
            {relationTypeStats
              .slice()
              .sort((a, b) => b.count - a.count)
              .slice(0, 6)
              .map((item) => (
                <li key={item.name}>
                  {item.name}：{item.count} 条
                </li>
              ))}
          </ul>
        )}
        {relationFocusEntities.length > 0 ? <p className="hint">关键实体（按关系频次）：{relationFocusEntities.join("、")}</p> : null}
        {businessSummary?.model ? (
          <p className="hint">
            摘要模型：{normalizeInlineMarkdownText(businessSummary.model)}
            {summaryGeneratedAtText ? ` · 生成时间：${summaryGeneratedAtText}` : ""}
          </p>
        ) : null}
        {businessSummaryLoading ? <p className="hint">正在刷新关系明细摘要...</p> : null}
        {businessSummaryError ? <p className="error-inline">模型摘要生成失败：{businessSummaryError}（当前显示结构化明细）</p> : null}
      </div>
      <div className="info-box">
        <h3>领域规则说明（沉淀清单）</h3>
        {domainRuleDescriptions.length === 0 ? (
          <p className="hint">暂无可读规则说明。</p>
        ) : (
          <ul>
            {domainRuleDescriptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="info-box">
        <h3>业务实体卡片</h3>
        {entityCards.length === 0 ? (
          <p className="hint">当前尚未形成可展示的业务实体。</p>
        ) : (
          <div className="model-entity-card-grid">
            {entityCards.map((item) => (
              <article key={item.id} className="model-entity-card">
                <div className="model-entity-card-head">
                  <strong>{item.title}</strong>
                  <span>{item.technicalName}</span>
                </div>
                <p>{item.definition}</p>
                {item.aliases.length > 0 ? <p className="hint">别名：{item.aliases.join("、")}</p> : null}
                {item.technicalAliases.length > 0 ? <p className="hint">技术映射：{item.technicalAliases.join("、")}</p> : null}
                <div className="model-entity-chip-row">
                  <span>{item.relationCount} 条关系</span>
                  <span>{item.ruleCount} 条规则</span>
                  <span>{item.fieldPreview.length} 个属性</span>
                </div>
                {item.fieldPreview.length > 0 ? (
                  <div className="model-entity-field-list">
                    {item.fieldPreview.map((field) => (
                      <code key={`${item.id}-${field}`}>{field}</code>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="info-box">
        <h3>规则映射与业务约束</h3>
        {ruleMappings.length === 0 ? (
          <p className="hint">暂无规则映射，建议补充业务规则与实体绑定。</p>
        ) : (
          <ul className="model-rule-mapping-list">
            {ruleMappings.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <p>{item.statement}</p>
                <p className="hint">作用实体：{item.linkedEntities.join("、") || "未绑定实体"}</p>
                {item.linkedSurfaces.length > 0 ? <p className="hint">关联页面：{item.linkedSurfaces.join("、")}</p> : null}
                {item.linkedApis.length > 0 ? <p className="hint">关联 API：{item.linkedApis.join("、")}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="info-box">
        <h3>业务关系叙事</h3>
        {relationNarratives.length === 0 ? (
          <p className="hint">暂无关系叙事，可先补充实体关系与业务含义。</p>
        ) : (
          <ul className="model-rule-mapping-list">
            {relationNarratives.slice(0, 8).map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.meaning}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sr-only" aria-hidden="true">
        建模依据：当前项目沉淀数据实体 {displayedModelEntityCount} 个、实体关系 {displayedModelRelationsCount} 条。
      </div>
    </>
  );
}
