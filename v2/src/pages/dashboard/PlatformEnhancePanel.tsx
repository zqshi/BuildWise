import { useMemo, useState } from "react";
import type { GovernanceRole } from "../../domain/workspace/governanceTypes";
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

type Props = {
  loading: boolean;
  deploymentGate?: {
    score: number;
    gate: "pass" | "warning" | "block";
    reason: string;
  } | null;
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  governanceRoles: GovernanceRole[];
  versionSnapshots: VersionSnapshot[];
  projectShares: ProjectShare[];
  templates: TemplateItem[];
  templateRuns: TemplateRunHistory[];
  latestTemplateRun: TemplateRunResult | null;
  opsMetrics: OpsMetricsPayload | null;
  deployments: DeploymentRecord[];
  shareAccess: ShareAccessPayload | null;
  onRoleChange: (role: "owner" | "pm" | "developer" | "qa" | "viewer") => void;
  onCreateSnapshot: () => Promise<void>;
  onRestoreSnapshot: (snapshotId: number) => Promise<void>;
  onCreateShare: () => Promise<void>;
  onRunTemplate: (templateId: string, parameters: Record<string, string>) => Promise<void>;
  onCreateDeployment: (environment: "staging" | "production") => Promise<void>;
  onTransitionDeployment: (deploymentId: number, toStatus: "running" | "success" | "failed") => Promise<void>;
  onAccessShare: (token: string) => Promise<void>;
  onCommentShare: (token: string, content: string) => Promise<void>;
};

export function PlatformEnhancePanel({
  loading,
  deploymentGate = null,
  currentRole,
  governanceRoles,
  versionSnapshots,
  projectShares,
  templates,
  templateRuns,
  latestTemplateRun,
  opsMetrics,
  deployments,
  shareAccess,
  onRoleChange,
  onCreateSnapshot,
  onRestoreSnapshot,
  onCreateShare,
  onRunTemplate,
  onCreateDeployment,
  onTransitionDeployment,
  onAccessShare,
  onCommentShare
}: Props) {
  const [templateFocus, setTemplateFocus] = useState("质量门禁");
  const [templateOwner, setTemplateOwner] = useState("平台组");
  const [shareToken, setShareToken] = useState("");
  const [shareComment, setShareComment] = useState("");
  const currentRoleInfo = useMemo(
    () => governanceRoles.find((item) => item.id === currentRole),
    [governanceRoles, currentRole]
  );

  const productionBlocked = deploymentGate?.gate === "block";
  return (
    <>
      <div className="info-box">
        <h3>增强模式</h3>
        <p>当前执行角色</p>
        <select value={currentRole} onChange={(event) => onRoleChange(event.target.value as Props["currentRole"])}>
          <option value="owner">owner</option>
          <option value="pm">pm</option>
          <option value="developer">developer</option>
          <option value="qa">qa</option>
          <option value="viewer">viewer</option>
        </select>
        <p>{currentRoleInfo?.name || currentRole} · 权限 {currentRoleInfo?.permissions.length ?? 0} 项</p>
      </div>
      <div className="info-box">
        <h3>协作与版本（V0.9+）</h3>
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
        {versionSnapshots.slice(0, 2).map((item) => (
          <p key={item.id}>
            {item.name} ({item.status})
            <button type="button" className="btn ghost mini" onClick={() => onRestoreSnapshot(item.id)} disabled={loading}>
              恢复
            </button>
          </p>
        ))}
        {projectShares.slice(0, 1).map((item) => (
          <p key={item.id}>share:{item.token}</p>
        ))}
        <div className="chat-tools">
          <input value={shareToken} onChange={(event) => setShareToken(event.target.value)} placeholder="输入分享 token" />
          <button type="button" className="btn ghost mini" disabled={!shareToken.trim()} onClick={() => onAccessShare(shareToken.trim())}>
            验证分享
          </button>
        </div>
        {shareAccess ? (
          <>
            <p>{shareAccess.project.name} · 权限 {shareAccess.permission}</p>
            <div className="chat-tools">
              <input value={shareComment} onChange={(event) => setShareComment(event.target.value)} placeholder="分享评论内容" />
              <button
                type="button"
                className="btn ghost mini"
                disabled={!shareComment.trim()}
                onClick={() => onCommentShare(shareAccess.token, shareComment.trim())}
              >
                留言
              </button>
            </div>
          </>
        ) : null}
      </div>
      <div className="info-box">
        <h3>模板与智能体（V1.0+）</h3>
        <div className="chat-tools">
          <input value={templateFocus} onChange={(event) => setTemplateFocus(event.target.value)} placeholder="focus" />
          <input value={templateOwner} onChange={(event) => setTemplateOwner(event.target.value)} placeholder="owner" />
        </div>
        <div className="chat-tools">
          {templates.slice(0, 3).map((item) => (
            <button
              key={item.id}
              type="button"
              className="btn ghost mini"
              onClick={() => onRunTemplate(item.id, { focus: templateFocus, owner: templateOwner })}
              disabled={loading}
            >
              运行 {item.name}
            </button>
          ))}
        </div>
        {latestTemplateRun ? <p>{latestTemplateRun.summary}</p> : <p className="hint">暂无执行记录</p>}
        <p>运行历史：{templateRuns.length}</p>
      </div>
      <div className="info-box">
        <h3>交付与运维（V1.2+）</h3>
        <p>部署记录：{deployments.length}</p>
        <p>
          发布成功率：
          {opsMetrics?.metrics.find((item) => item.name === "deployment_success_rate")?.value ?? 0}%
        </p>
        <div className="chat-tools">
          <button type="button" className="btn ghost mini" onClick={() => onCreateDeployment("staging")} disabled={loading}>
            发布到 Staging
          </button>
          <button
            type="button"
            className="btn ghost mini"
            onClick={() => onCreateDeployment("production")}
            disabled={loading || productionBlocked}
            title={productionBlocked ? deploymentGate?.reason || "" : ""}
          >
            发布到 Production
          </button>
        </div>
        {deploymentGate ? (
          <p className="hint">
            门禁：{deploymentGate.gate.toUpperCase()}（score={deploymentGate.score}）{deploymentGate.reason ? ` · ${deploymentGate.reason}` : ""}
          </p>
        ) : null}
        {deployments.slice(0, 2).map((item) => (
          <p key={item.id}>
            {item.environment} / {item.version} / {item.status}
            {item.status === "queued" ? (
              <button type="button" className="btn ghost mini" onClick={() => onTransitionDeployment(item.id, "running")}>
                设为运行中
              </button>
            ) : null}
            {item.status === "running" ? (
              <>
                <button type="button" className="btn ghost mini" onClick={() => onTransitionDeployment(item.id, "success")}>
                  成功
                </button>
                <button type="button" className="btn ghost mini" onClick={() => onTransitionDeployment(item.id, "failed")}>
                  失败
                </button>
              </>
            ) : null}
          </p>
        ))}
      </div>
    </>
  );
}
