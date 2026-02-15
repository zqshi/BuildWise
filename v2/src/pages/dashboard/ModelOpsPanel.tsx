import type {
  ModelSummaryPayload,
  RoadmapPayload,
  RuleBindPayload,
  RuleCompilePayload,
  SyncReportPayload,
  TracePayload
} from "../../domain/workspace/types";

type Props = {
  loading: boolean;
  modelSummary: ModelSummaryPayload | null;
  ruleCompile: RuleCompilePayload | null;
  ruleBind: RuleBindPayload | null;
  syncReport: SyncReportPayload | null;
  traceReport: TracePayload | null;
  roadmapReports: RoadmapPayload[];
  onRefresh: () => void;
};

export function ModelOpsPanel({
  loading,
  modelSummary,
  ruleCompile,
  ruleBind,
  syncReport,
  traceReport,
  roadmapReports,
  onRefresh
}: Props) {
  const stageOrder = ["S1", "S2", "S3", "S4"] as const;
  const stageBuckets = stageOrder.map((stage) => ({
    stage,
    items: roadmapReports.filter((item) => item.stage === stage)
  }));

  return (
    <section className="panel model-ops-panel">
      <div className="panel-head">
        <h2>模型中台实时面板</h2>
        <button type="button" className="btn ghost mini" onClick={onRefresh} disabled={loading}>
          {loading ? "刷新中..." : "刷新"}
        </button>
      </div>
      <div className="ops-grid">
        <article className="info-box">
          <h3>同步评分</h3>
          <p className="ops-score">{syncReport?.coverageScore ?? 0}</p>
          <p>{syncReport?.summary || "暂无数据"}</p>
        </article>
        <article className="info-box">
          <h3>规则编译</h3>
          <p>规则总数：{ruleCompile?.ruleCount ?? 0}</p>
          <p>有效规则：{ruleCompile?.validRules ?? 0}</p>
          <p>告警数：{ruleCompile?.warnings?.length ?? 0}</p>
        </article>
        <article className="info-box">
          <h3>规则绑定</h3>
          <p>绑定条目：{ruleBind?.bindings?.length ?? 0}</p>
          <p>未绑定：{ruleBind?.bindings?.filter((item) => item.status === "unbound").length ?? 0}</p>
          <p>最近生成：{ruleBind?.generatedAt ? new Date(ruleBind.generatedAt).toLocaleString("zh-CN") : "-"}</p>
        </article>
        <article className="info-box">
          <h3>模型资产摘要</h3>
          <p>实体：{modelSummary?.stats?.entities ?? 0}</p>
          <p>页面：{modelSummary?.stats?.pages ?? 0}</p>
          <p>接口：{modelSummary?.stats?.apis ?? 0}</p>
        </article>
      </div>
      <div className="trace-preview">
        <h3>追溯链路预览（Top 6）</h3>
        {traceReport?.items?.length ? (
          <ul>
            {traceReport.items.slice(0, 6).map((item, index) => (
              <li key={`${item.pageRoute}-${item.apiPath}-${index}`}>
                <span>{item.modelRef}</span>
                <span>{item.codeRef}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">暂无追溯数据</p>
        )}
      </div>
      <div className="info-box">
        <h3>同步影响与风险</h3>
        <p>影响项：{syncReport?.impacts?.length ?? 0}</p>
        <p>风险项：{syncReport?.risks?.length ?? 0}</p>
        {syncReport?.risks?.slice(0, 2).map((risk) => (
          <p key={risk}>- {risk}</p>
        ))}
      </div>
      <div className="info-box">
        <h3>Roadmap 契约状态（V0.1-V1.2）</h3>
        {roadmapReports.length === 0 ? (
          <p>暂无数据</p>
        ) : (
          stageBuckets.map((bucket) => {
            if (bucket.items.length === 0) {
              return null;
            }
            const readyCount = bucket.items.filter(
              (item) => item.modelContract.apiDeclared && item.modelContract.statusFieldDeclared
            ).length;
            return (
              <div key={bucket.stage}>
                <p>
                  {bucket.stage}：{readyCount}/{bucket.items.length} 已就绪
                </p>
                <ul>
                  {bucket.items.map((item) => (
                    <li key={item.version}>
                      {item.version}：
                      {item.modelContract.apiDeclared && item.modelContract.statusFieldDeclared ? "已就绪" : "待补齐"}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
