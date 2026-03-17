import type { ProjectOverviewRepositoryDrawerProps } from "./projectOverviewPanelDrawerTypes";

export function ProjectOverviewPanelRepositoryDrawer({
  showRepoConfigDrawer,
  setShowRepoConfigDrawer,
  repoConfigStep,
  setRepoConfigStep,
  repoUrlDraft,
  setRepoUrlDraft,
  currentProjectExists,
  repoConfigBusy,
  repoValidationBusy,
  repoUrlValid,
  repoValidationError,
  requireRemoteForProduction,
  setRequireRemoteForProduction,
  requireRemoteForStaging,
  setRequireRemoteForStaging,
  repoHealth,
  repoLastCheckedText,
  repoConfigNotice,
  showRepoAdvanced,
  setShowRepoAdvanced,
  repoMigrationPlan,
  canMoveToNextStep,
  handleAdvanceRepositoryStep,
  handleSaveRepositoryPolicy,
  handleRefreshRepositoryStatus,
  handleConnectRepository
}: ProjectOverviewRepositoryDrawerProps) {
  return (
    <>
      <div className={`analysis-drawer-mask ${showRepoConfigDrawer ? "open" : ""}`} onClick={() => setShowRepoConfigDrawer(false)} aria-hidden={!showRepoConfigDrawer} />
      <aside className={`panel preview-panel context-panel artifact-preview-panel analysis-drawer ${showRepoConfigDrawer ? "open" : ""}`}>
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <div className="panel-head">
            <h2>代码仓设置（业务版）</h2>
            <div className="chat-tools"><button type="button" className="btn ghost mini" onClick={() => setShowRepoConfigDrawer(false)}>关闭</button></div>
          </div>
          <div className="preview-scroll">
            <div className="repo-stepper">
              {[1, 2, 3].map((step) => (
                <div key={step} className={`repo-step-item ${repoConfigStep === step ? "active" : ""} ${repoConfigStep > step ? "done" : ""}`}>
                  <span>{step}</span><em>{step === 1 ? "填写仓库地址" : step === 2 ? "设置发布规则" : "确认并连接"}</em>
                </div>
              ))}
            </div>

            {repoConfigStep === 1 ? (
              <div className="info-box">
                <h3>第一步：填写仓库地址</h3>
                <p className="hint">输入一个 Git 仓库地址，系统会自动识别平台。</p>
                <div className="repo-url-card">
                  <label className="repo-url-label">
                    <span>Git 仓库地址</span>
                    <span className="repo-url-label-tip">支持 `https://`、`ssh://`、`git@`</span>
                    <input className="repo-url-input" type="text" value={repoUrlDraft} onChange={(event) => setRepoUrlDraft(event.target.value)} placeholder="例如：https://github.com/your-org/your-repo.git" disabled={!currentProjectExists || repoConfigBusy} />
                  </label>
                  <p className="repo-url-example">示例：`https://github.com/acme/buildwise.git` 或 `git@github.com:acme/buildwise.git`</p>
                </div>
                {!repoUrlDraft.trim() ? <p className="hint">请先粘贴代码仓地址。</p> : null}
                {repoUrlDraft.trim() && !repoUrlValid ? <p className="error-inline">地址格式看起来不正确，请使用 https://、ssh:// 或 git@ 开头。</p> : null}
                {repoValidationError ? <p className="error-inline">{repoValidationError}</p> : null}
                {repoValidationBusy ? <p className="hint">正在检测远端仓库可达性…</p> : null}
                {!repoValidationBusy && !repoValidationError && repoUrlValid ? <p className="hint">点击“下一步”时会校验仓库是否真实可达，校验失败将不能继续。</p> : null}
              </div>
            ) : null}

            {repoConfigStep === 2 ? (
              <div className="info-box">
                <h3>第二步：设置发布规则</h3>
                <p className="hint">确定哪些发布阶段必须先连上代码仓。</p>
                <div className="iteration-meta-grid">
                  <label className="doc-item"><input type="checkbox" checked={requireRemoteForProduction} onChange={(event) => setRequireRemoteForProduction(event.target.checked)} disabled={!currentProjectExists || repoConfigBusy} />正式发布前必须连接代码仓（推荐）</label>
                  <label className="doc-item"><input type="checkbox" checked={requireRemoteForStaging} onChange={(event) => setRequireRemoteForStaging(event.target.checked)} disabled={!currentProjectExists || repoConfigBusy} />预发演示前必须连接代码仓</label>
                </div>
              </div>
            ) : null}

            {repoConfigStep === 3 ? (
              <>
                <div className="info-box">
                  <h3>第三步：确认并连接</h3>
                  <p className="hint">确认地址与规则后，执行连接并检查状态。</p>
                  <div className="repo-status-grid">
                    <div className={`repo-status-card ${repoHealth?.remoteConfigured ? "is-ok" : "is-warn"}`}><p className="repo-status-label">地址已配置</p><strong>{repoHealth ? (repoHealth.remoteConfigured ? "已完成" : "未完成") : "-"}</strong></div>
                    <div className={`repo-status-card ${repoHealth?.remoteReachable ? "is-ok" : "is-warn"}`}><p className="repo-status-label">连接可用</p><strong>{repoHealth ? (repoHealth.remoteReachable ? "可连接" : "不可连接") : "-"}</strong></div>
                    <div className={`repo-status-card ${repoHealth?.remoteSynced ? "is-ok" : "is-warn"}`}><p className="repo-status-label">同步状态</p><strong>{repoHealth ? (repoHealth.remoteSynced ? "正常" : "待同步") : "-"}</strong></div>
                  </div>
                  {repoLastCheckedText ? <p className="hint">最近检查：{repoLastCheckedText}</p> : null}
                  {repoHealth?.lastError ? <p className="hint">最近连接提示：{repoHealth.lastError}</p> : null}
                  {repoConfigNotice ? <p className="hint">{repoConfigNotice}</p> : null}
                </div>

                <div className="info-box">
                  <div className="panel-head tight">
                    <h3>高级信息</h3>
                    <button type="button" className="btn ghost mini" onClick={() => setShowRepoAdvanced((prev) => !prev)}>{showRepoAdvanced ? "隐藏" : "查看"}</button>
                  </div>
                  {showRepoAdvanced && repoMigrationPlan ? (
                    <div className="info-box">
                      <h3>迁移建议（{repoMigrationPlan.currentMode} {"->"} {repoMigrationPlan.targetMode}）</h3>
                      <p className="hint">系统建议下一步：{repoMigrationPlan.nextAction}</p>
                      {repoMigrationPlan.blockers.length > 0 ? <p className="hint">当前阻碍项：{repoMigrationPlan.blockers.join("；")}</p> : null}
                      <ul className="history-list">
                        {repoMigrationPlan.steps.map((item) => (
                          <li key={item.id} className="history-item"><strong>{item.title}</strong><p>{item.description}</p><p className="hint">状态：{item.status.toUpperCase()} · 系统动作：{item.action}</p></li>
                        ))}
                      </ul>
                    </div>
                  ) : <p className="hint">高级信息默认收起，避免干扰业务操作。</p>}
                </div>
              </>
            ) : null}

            <div className="repo-config-actions">
              <button type="button" className="btn ghost mini" disabled={repoConfigStep === 1} onClick={() => setRepoConfigStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev))}>上一步</button>
              {repoConfigStep < 3 ? <button type="button" className="btn ghost mini" disabled={!canMoveToNextStep || repoValidationBusy} onClick={() => void handleAdvanceRepositoryStep()}>{repoValidationBusy ? "检测中…" : "下一步"}</button> : null}
              {repoConfigStep === 2 ? <button type="button" className="btn ghost mini" disabled={!currentProjectExists || repoConfigBusy} onClick={() => void handleSaveRepositoryPolicy()}>保存发布前规则</button> : null}
              {repoConfigStep === 3 ? <button type="button" className="btn ghost mini" disabled={!currentProjectExists || repoConfigBusy} onClick={() => void handleRefreshRepositoryStatus()}>刷新连接状态</button> : null}
              <button type="button" className="btn primary mini" disabled={!currentProjectExists || repoConfigBusy || repoValidationBusy || !repoUrlValid || repoConfigStep !== 3} onClick={() => void handleConnectRepository()}>保存并连接仓库</button>
            </div>
          </div>
        </article>
      </aside>
    </>
  );
}
