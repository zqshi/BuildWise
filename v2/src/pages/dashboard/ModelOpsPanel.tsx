import { useState } from "react";
import type {
  ModelRelationPayload,
  ModelSummaryPayload,
  RoadmapPayload,
  RuleBindPayload,
  RuleCompilePayload,
  SyncReportPayload,
  TracePayload
} from "../../domain/workspace/types";
import type { AuditLog, GovernanceRole } from "../../domain/workspace/governanceTypes";
import type {
  DeploymentRecord,
  OpsMetricsPayload,
  ProjectShare,
  TemplateItem,
  TemplateRunResult,
  VersionSnapshot
} from "../../domain/workspace/platformTypes";

type Props = {
  loading: boolean;
  modelSummary: ModelSummaryPayload | null;
  modelRelations: ModelRelationPayload[];
  ruleCompile: RuleCompilePayload | null;
  ruleBind: RuleBindPayload | null;
  syncReport: SyncReportPayload | null;
  traceReport: TracePayload | null;
  roadmapReports: RoadmapPayload[];
  governanceRoles: GovernanceRole[];
  auditLogs: AuditLog[];
  versionSnapshots: VersionSnapshot[];
  projectShares: ProjectShare[];
  templates: TemplateItem[];
  latestTemplateRun: TemplateRunResult | null;
  opsMetrics: OpsMetricsPayload | null;
  deployments: DeploymentRecord[];
  onCreateRelation: (payload: {
    fromEntityId: string;
    toEntityId: string;
    type: "one_to_one" | "one_to_many" | "many_to_many";
    name?: string;
  }) => Promise<void>;
  onDeleteRelation: (relationId: string) => Promise<void>;
  onRefresh: () => void;
  onCreateSnapshot: () => Promise<void>;
  onRestoreSnapshot: (snapshotId: number) => Promise<void>;
  onCreateShare: () => Promise<void>;
  onRunTemplate: (templateId: string) => Promise<void>;
  onCreateDeployment: (environment: "staging" | "production") => Promise<void>;
};

export function ModelOpsPanel({
  loading,
  modelSummary,
  modelRelations,
  ruleCompile,
  ruleBind,
  syncReport,
  traceReport,
  roadmapReports,
  governanceRoles,
  auditLogs,
  versionSnapshots,
  projectShares,
  templates,
  latestTemplateRun,
  opsMetrics,
  deployments,
  onCreateRelation,
  onDeleteRelation,
  onRefresh,
  onCreateSnapshot,
  onRestoreSnapshot,
  onCreateShare,
  onRunTemplate,
  onCreateDeployment
}: Props) {
  const [fromEntityId, setFromEntityId] = useState("entity_project");
  const [toEntityId, setToEntityId] = useState("entity_iteration");
  const [relationType, setRelationType] = useState<"one_to_one" | "one_to_many" | "many_to_many">("one_to_many");
  const [relationName, setRelationName] = useState("");
  const [relationError, setRelationError] = useState<string | null>(null);
  const stageOrder = ["S1", "S2", "S3", "S4"] as const;
  const stageBuckets = stageOrder.map((stage) => ({
    stage,
    items: roadmapReports.filter((item) => item.stage === stage)
  }));
  const submitRelation = async () => {
    setRelationError(null);
    if (!fromEntityId || !toEntityId) {
      setRelationError("请选择来源和目标实体。");
      return;
    }
    try {
      await onCreateRelation({
        fromEntityId,
        toEntityId,
        type: relationType,
        name: relationName.trim() || undefined
      });
      setRelationName("");
    } catch (err) {
      setRelationError(err instanceof Error ? err.message : "关系创建失败");
    }
  };

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
        <h3>权限与治理（V0.8）</h3>
        <p>角色数：{governanceRoles.length}</p>
        <p>审计日志：{auditLogs.length}</p>
        {governanceRoles.slice(0, 3).map((role) => (
          <p key={role.id}>
            {role.name}：{role.permissions.length} 项权限
          </p>
        ))}
        {auditLogs.slice(0, 3).map((log) => (
          <p key={log.id}>
            [{new Date(log.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}] {log.action}
          </p>
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
      <div className="info-box">
        <h3>协作与版本（V0.9）</h3>
        <p>快照：{versionSnapshots.length}</p>
        <p>分享链接：{projectShares.length}</p>
        <div className="chat-tools">
          <button type="button" className="btn ghost mini" onClick={onCreateSnapshot} disabled={loading}>
            创建快照
          </button>
          <button type="button" className="btn ghost mini" onClick={onCreateShare} disabled={loading}>
            生成分享
          </button>
        </div>
        {versionSnapshots.slice(0, 3).map((item) => (
          <p key={item.id}>
            {item.name} ({item.status})
            <button type="button" className="btn ghost mini" onClick={() => onRestoreSnapshot(item.id)} disabled={loading}>
              恢复
            </button>
          </p>
        ))}
        {projectShares.slice(0, 2).map((item) => (
          <p key={item.id}>share:{item.token} · {item.permission}</p>
        ))}
      </div>
      <div className="info-box">
        <h3>模板与智能体（V1.0）</h3>
        <p>模板数：{templates.length}</p>
        <div className="chat-tools">
          {templates.slice(0, 3).map((item) => (
            <button key={item.id} type="button" className="btn ghost mini" onClick={() => onRunTemplate(item.id)} disabled={loading}>
              运行 {item.name}
            </button>
          ))}
        </div>
        {latestTemplateRun ? <p>{latestTemplateRun.summary}</p> : <p className="hint">暂无执行记录</p>}
      </div>
      <div className="info-box">
        <h3>交付与运维（V1.2）</h3>
        <p>部署记录：{deployments.length}</p>
        <p>
          发布成功率：
          {opsMetrics?.metrics.find((item) => item.name === "deployment_success_rate")?.value ?? 0}%
        </p>
        <div className="chat-tools">
          <button type="button" className="btn ghost mini" onClick={() => onCreateDeployment("staging")} disabled={loading}>
            发布到 Staging
          </button>
          <button type="button" className="btn ghost mini" onClick={() => onCreateDeployment("production")} disabled={loading}>
            发布到 Production
          </button>
        </div>
        {deployments.slice(0, 2).map((item) => (
          <p key={item.id}>
            {item.environment} / {item.version} / {item.status}
          </p>
        ))}
      </div>
      <div className="info-box">
        <h3>关系建模（MVP）</h3>
        <p>当前关系数：{modelRelations.length}</p>
        <div className="chat-tools">
          <input value={fromEntityId} onChange={(event) => setFromEntityId(event.target.value)} placeholder="fromEntityId" />
          <input value={toEntityId} onChange={(event) => setToEntityId(event.target.value)} placeholder="toEntityId" />
          <select
            value={relationType}
            onChange={(event) => setRelationType(event.target.value as "one_to_one" | "one_to_many" | "many_to_many")}
          >
            <option value="one_to_one">one_to_one</option>
            <option value="one_to_many">one_to_many</option>
            <option value="many_to_many">many_to_many</option>
          </select>
          <input value={relationName} onChange={(event) => setRelationName(event.target.value)} placeholder="关系名称(可选)" />
          <button type="button" className="btn ghost mini" onClick={submitRelation} disabled={loading}>
            新增关系
          </button>
        </div>
        {relationError ? <p className="error-inline">{relationError}</p> : null}
        {modelRelations.length ? (
          <ul>
            {modelRelations.slice(0, 8).map((item) => (
              <li key={item.id}>
                {item.fromEntityId} {"->"} {item.toEntityId} ({item.type})
                <button
                  type="button"
                  className="btn ghost mini"
                  onClick={() => onDeleteRelation(item.id)}
                  disabled={loading}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">暂无关系定义</p>
        )}
      </div>
    </section>
  );
}
