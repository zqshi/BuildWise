import { useState } from "react";
import type {
  ModelRelationPayload,
  ModelSummaryPayload,
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
  ShareAccessPayload,
  TemplateItem,
  TemplateRunHistory,
  TemplateRunResult,
  VersionSnapshot
} from "../../domain/workspace/platformTypes";
import { PlatformEnhancePanel } from "./PlatformEnhancePanel";

type Props = {
  viewMode: "rules" | "quality";
  loading: boolean;
  modelSummary: ModelSummaryPayload | null;
  modelRelations: ModelRelationPayload[];
  ruleCompile: RuleCompilePayload | null;
  ruleBind: RuleBindPayload | null;
  syncReport: SyncReportPayload | null;
  traceReport: TracePayload | null;
  governanceRoles: GovernanceRole[];
  auditLogs: AuditLog[];
  versionSnapshots: VersionSnapshot[];
  projectShares: ProjectShare[];
  templates: TemplateItem[];
  templateRuns: TemplateRunHistory[];
  latestTemplateRun: TemplateRunResult | null;
  opsMetrics: OpsMetricsPayload | null;
  deployments: DeploymentRecord[];
  shareAccess: ShareAccessPayload | null;
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
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
  onRunTemplate: (templateId: string, parameters: Record<string, string>) => Promise<void>;
  onCreateDeployment: (environment: "staging" | "production") => Promise<void>;
  onTransitionDeployment: (deploymentId: number, toStatus: "running" | "success" | "failed") => Promise<void>;
  onAccessShare: (token: string) => Promise<void>;
  onCommentShare: (token: string, content: string) => Promise<void>;
  onRoleChange: (role: "owner" | "pm" | "developer" | "qa" | "viewer") => void;
};

export function ModelOpsPanel({
  viewMode,
  loading,
  modelSummary,
  modelRelations,
  ruleCompile,
  ruleBind,
  syncReport,
  traceReport,
  governanceRoles,
  auditLogs,
  versionSnapshots,
  projectShares,
  templates,
  templateRuns,
  latestTemplateRun,
  opsMetrics,
  deployments,
  shareAccess,
  currentRole,
  onCreateRelation,
  onDeleteRelation,
  onRefresh,
  onCreateSnapshot,
  onRestoreSnapshot,
  onCreateShare,
  onRunTemplate,
  onCreateDeployment,
  onTransitionDeployment,
  onAccessShare,
  onCommentShare,
  onRoleChange
}: Props) {
  const showRulesPanel = viewMode === "rules";
  const showQualityPanel = viewMode === "quality";
  const [fromEntityId, setFromEntityId] = useState("entity_project");
  const [toEntityId, setToEntityId] = useState("entity_iteration");
  const [relationType, setRelationType] = useState<"one_to_one" | "one_to_many" | "many_to_many">("one_to_many");
  const [relationName, setRelationName] = useState("");
  const [relationError, setRelationError] = useState<string | null>(null);
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
  const deploymentGate = (() => {
    const findMetric = (name: string) => Number(opsMetrics?.metrics?.find((item) => item.name === name)?.value ?? 0);
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          findMetric("deployment_success_rate") * 0.35 +
            findMetric("iteration_test_matrix_execution_coverage") * 0.35 +
            findMetric("iteration_test_matrix_pass_rate") * 0.3
        )
      )
    );
    const gate = score >= 85 ? "pass" : score >= 65 ? "warning" : "block";
    const reason = gate === "block" ? "当前质量门禁触发 BLOCK，禁止直接发布 Production" : "";
    return { score, gate: gate as "pass" | "warning" | "block", reason };
  })();

  return (
    <section className="panel model-ops-panel">
      <div className="panel-head">
        <h2>项目建模与治理面板</h2>
        <button type="button" className="btn ghost mini" onClick={onRefresh} disabled={loading}>
          {loading ? "刷新中..." : "刷新"}
        </button>
      </div>
      <p className="hint">该面板用于项目级建模与治理，不建议在全局仪表盘常驻展示。</p>
      <div className="ops-grid">
        {showQualityPanel ? (
          <article className="info-box">
            <h3>同步评分</h3>
            <p className="ops-score">{syncReport?.coverageScore ?? 0}</p>
            <p>{syncReport?.summary || "暂无数据"}</p>
          </article>
        ) : null}
        {showRulesPanel ? (
          <article className="info-box">
            <h3>规则编译</h3>
            <p>规则总数：{ruleCompile?.ruleCount ?? 0}</p>
            <p>有效规则：{ruleCompile?.validRules ?? 0}</p>
            <p>告警数：{ruleCompile?.warnings?.length ?? 0}</p>
          </article>
        ) : null}
        {showRulesPanel ? (
          <article className="info-box">
            <h3>规则绑定</h3>
            <p>绑定条目：{ruleBind?.bindings?.length ?? 0}</p>
            <p>未绑定：{ruleBind?.bindings?.filter((item) => item.status === "unbound").length ?? 0}</p>
            <p>最近生成：{ruleBind?.generatedAt ? new Date(ruleBind.generatedAt).toLocaleString("zh-CN") : "-"}</p>
          </article>
        ) : null}
        {showRulesPanel ? (
          <article className="info-box">
            <h3>模型资产摘要</h3>
            <p>实体：{modelSummary?.stats?.entities ?? 0}</p>
            <p>页面：{modelSummary?.stats?.pages ?? 0}</p>
            <p>接口：{modelSummary?.stats?.apis ?? 0}</p>
          </article>
        ) : null}
      </div>
      {showQualityPanel ? (
        <>
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
          <PlatformEnhancePanel
            loading={loading}
            deploymentGate={deploymentGate}
            currentRole={currentRole}
            governanceRoles={governanceRoles}
            versionSnapshots={versionSnapshots}
            projectShares={projectShares}
            templates={templates}
            templateRuns={templateRuns}
            latestTemplateRun={latestTemplateRun}
            opsMetrics={opsMetrics}
            deployments={deployments}
            shareAccess={shareAccess}
            onRoleChange={onRoleChange}
            onCreateSnapshot={onCreateSnapshot}
            onRestoreSnapshot={onRestoreSnapshot}
            onCreateShare={onCreateShare}
            onRunTemplate={onRunTemplate}
            onCreateDeployment={onCreateDeployment}
            onTransitionDeployment={onTransitionDeployment}
            onAccessShare={onAccessShare}
            onCommentShare={onCommentShare}
          />
        </>
      ) : null}
      {showRulesPanel ? (
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
      ) : null}
    </section>
  );
}
