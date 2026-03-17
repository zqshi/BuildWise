import type { OpenclawDialogMode } from "../layout/openclawPromptComposer";
import type { ProjectOverviewGovernanceDrawersProps } from "./projectOverviewPanelDrawerTypes";

export function ProjectOverviewPanelGovernanceDrawers({
  showPolicyDrawer,
  setShowPolicyDrawer,
  showOpenclawDrawer,
  setShowOpenclawDrawer,
  activePolicy,
  policyItems,
  isAdmin,
  policyBusy,
  handleCreatePolicyDraft,
  handleActivateLatestDraft,
  handleRestoreInitialPolicyMode,
  handleRunPolicyStep,
  bindingProfile,
  setBindingProfile,
  bindingAgentId,
  setBindingAgentId,
  bindingWorkspacePath,
  setBindingWorkspacePath,
  bindingRuntimeMode,
  setBindingRuntimeMode,
  handleBindWorkspace,
  newRoleUserId,
  setNewRoleUserId,
  newRoleValue,
  setNewRoleValue,
  handleAddRoleBinding,
  roleBindings,
  handleRemoveRoleBinding,
  targetIterationId,
  openclawChatLines,
  openclawDialogMode,
  setOpenclawDialogMode,
  openclawChatInput,
  setOpenclawChatInput,
  openclawChatBusy,
  handleOpenclawSend,
  policyLogs
}: ProjectOverviewGovernanceDrawersProps) {
  return (
    <>
      <div className={`analysis-drawer-mask ${showPolicyDrawer ? "open" : ""}`} onClick={() => setShowPolicyDrawer(false)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Escape") setShowPolicyDrawer(false); }} aria-label="关闭" aria-hidden={!showPolicyDrawer} />
      <aside className={`panel preview-panel context-panel artifact-preview-panel analysis-drawer ${showPolicyDrawer ? "open" : ""}`}>
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <div className="panel-head">
            <h2>权限管理与策略</h2>
            <div className="chat-tools">
              <button type="button" className="btn ghost mini" onClick={() => setShowPolicyDrawer(false)}>关闭</button>
            </div>
          </div>
          <div className="preview-scroll">
            <div className="info-box">
              <h3>策略版本</h3>
              <p>生效策略：{activePolicy ? `v${activePolicy.version}` : "无"}</p>
              <p>草案数量：{policyItems.filter((item) => item.status === "draft").length}</p>
              <div className="chat-tools">
                <button type="button" className="btn ghost mini" onClick={() => void handleCreatePolicyDraft()} disabled={!isAdmin || policyBusy}>新建草案</button>
                <button type="button" className="btn ghost mini" onClick={() => void handleActivateLatestDraft()} disabled={!isAdmin || policyBusy}>激活最新草案</button>
                <button type="button" className="btn ghost mini" onClick={() => void handleRestoreInitialPolicyMode()} disabled={!isAdmin || policyBusy}>恢复初始化模式</button>
                <button type="button" className="btn ghost mini" onClick={() => void handleRunPolicyStep()} disabled={policyBusy}>执行策略检查</button>
              </div>
            </div>

            <div className="info-box">
              <h3>工作区绑定</h3>
              <label><span>OpenClaw Profile</span><input value={bindingProfile} onChange={(e) => setBindingProfile(e.target.value)} /></label>
              <label><span>Agent ID</span><input value={bindingAgentId} onChange={(e) => setBindingAgentId(e.target.value)} /></label>
              <label><span>Workspace Path</span><input value={bindingWorkspacePath} onChange={(e) => setBindingWorkspacePath(e.target.value)} /></label>
              <label>
                <span>Runtime</span>
                <select value={bindingRuntimeMode} onChange={(e) => setBindingRuntimeMode(e.target.value as "openclaw-native" | "bridge")}>
                  <option value="openclaw-native">openclaw-native</option>
                  <option value="bridge">bridge</option>
                </select>
              </label>
              <button type="button" className="btn ghost mini" onClick={() => void handleBindWorkspace()} disabled={!isAdmin || policyBusy}>保存绑定</button>
            </div>

            <div className="info-box">
              <h3>项目成员权限</h3>
              <div className="chat-tools">
                <input value={newRoleUserId} onChange={(e) => setNewRoleUserId(e.target.value)} placeholder="user-id" />
                <select value={newRoleValue} onChange={(e) => setNewRoleValue(e.target.value as "admin" | "member" | "viewer")}>
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                  <option value="viewer">viewer</option>
                </select>
                <button type="button" className="btn ghost mini" onClick={() => void handleAddRoleBinding()} disabled={!isAdmin || policyBusy}>更新</button>
              </div>
              {roleBindings.length === 0 ? <p className="hint">暂无项目级权限记录。</p> : (
                <ul className="iteration-list">
                  {roleBindings.map((item) => (
                    <li key={`${item.userId}-${item.projectId}`}>
                      <strong>{item.userId}</strong>
                      <span>{item.role}</span>
                      <button type="button" className="btn ghost mini" onClick={() => void handleRemoveRoleBinding(item.userId)} disabled={!isAdmin || policyBusy}>移除</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </article>
      </aside>

      <div className={`analysis-drawer-mask ${showOpenclawDrawer ? "open" : ""}`} onClick={() => setShowOpenclawDrawer(false)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Escape") setShowOpenclawDrawer(false); }} aria-label="关闭" aria-hidden={!showOpenclawDrawer} />
      <aside className={`panel preview-panel context-panel artifact-preview-panel analysis-drawer ${showOpenclawDrawer ? "open" : ""}`}>
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <div className="panel-head">
            <h2>OpenClaw 对话主窗口</h2>
            <div className="chat-tools"><button type="button" className="btn ghost mini" onClick={() => setShowOpenclawDrawer(false)}>关闭</button></div>
          </div>
          <div className="preview-scroll">
            <div className="info-box">
              <p>目标迭代：{targetIterationId || "无"}</p>
              <p>管理员可在此明确执行链路策略，再由迭代流程执行。</p>
            </div>
            <div className="info-box">
              {openclawChatLines.length === 0 ? <p className="hint">暂无对话记录。</p> : (
                <ul className="history-list">
                  {openclawChatLines.map((item, idx) => (
                    <li key={`${item.at}-${idx}`} className="history-item"><strong>{item.role === "admin" ? "管理员" : "OpenClaw"}</strong><p>{item.content}</p></li>
                  ))}
                </ul>
              )}
              <div className="chat-tools">
                <label className="hint">
                  对话模式
                  <select value={openclawDialogMode} onChange={(e) => setOpenclawDialogMode(e.target.value as OpenclawDialogMode)}>
                    <option value="native">原生自然语言（推荐）</option>
                    <option value="orchestration">策略约束模式</option>
                  </select>
                </label>
              </div>
              <p className="hint">{openclawDialogMode === "native" ? "将按原生自然语言发送。" : "发送前将追加项目策略治理约束。"}</p>
              <div className="chat-tools">
                <input
                  value={openclawChatInput}
                  onChange={(e) => setOpenclawChatInput(e.target.value)}
                  placeholder={openclawDialogMode === "native" ? "输入你的问题（原生自然语言）" : "输入策略指令，例如：首版必须先确认Git分析报告"}
                />
                <button type="button" className="btn ghost mini" onClick={() => void handleOpenclawSend()} disabled={!isAdmin || openclawChatBusy || !openclawChatInput.trim()}>{openclawChatBusy ? "发送中..." : "发送"}</button>
              </div>
            </div>
            <div className="info-box">
              <h3>策略执行日志</h3>
              {policyLogs.length === 0 ? <p className="hint">暂无日志。</p> : (
                <ul className="history-list">
                  {policyLogs.map((item) => (
                    <li key={item.id} className="history-item"><strong>v{item.policyVersion} · {item.stage} · {item.result}</strong><p>{item.action}</p></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </article>
      </aside>
    </>
  );
}
