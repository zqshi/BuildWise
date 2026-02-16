import type { ChangeEvent, RefObject } from "react";
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationStatus,
  IterationMessage,
} from "../../domain/workspace/types";

type IterationWorkspacePanelProps = {
  currentIteration: Iteration | null;
  contextData: IterationContextPayload | null;
  stateMachine: IterationStateMachinePayload | null;
  chatMessages: IterationMessage[];
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  uploadedFile: { name: string; iterationId: number } | null;
  analysisReport: AttachmentAnalysisReport | null;
  showAnalysisPanel: boolean;
  isAnalyzingAttachment: boolean;
  onUploadClick: () => void;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onChatInputChange: (value: string) => void;
  onChatSend: () => void;
  onTransitionState: (toStatus: IterationStatus) => void;
  onSwitchToProjectPanel: () => void;
};

export function IterationWorkspacePanel({
  currentIteration,
  contextData,
  stateMachine,
  chatMessages,
  chatInput,
  fileInputRef,
  uploadedFile,
  analysisReport,
  showAnalysisPanel,
  isAnalyzingAttachment,
  onUploadClick,
  onOpenAnalysisPanel,
  onCloseAnalysisPanel,
  onUpload,
  onChatInputChange,
  onChatSend,
  onTransitionState,
  onSwitchToProjectPanel
}: IterationWorkspacePanelProps) {
  const scopeInCount = contextData?.scope.inScope.length ?? 0;
  const scopeOutCount = contextData?.scope.outOfScope.length ?? 0;
  const acceptanceCount = contextData?.scope.acceptanceCriteria.length ?? 0;
  const getRoleLabel = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "BuildWise AI" : "系统");
  const getRoleAvatar = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "AI" : "系");
  const getMsgKind = (msg: IterationMessage) => {
    if (msg.role === "system" && msg.content.startsWith("已上传附件")) {
      return "event-upload";
    }
    if (msg.role === "assistant" && msg.content.includes("附件已完成大模型分析")) {
      return "event-analysis";
    }
    return "";
  };
  const getMsgTheme = (msg: IterationMessage) => {
    const content = msg.content.toLowerCase();
    if (content.includes("风险") || content.includes("阻塞")) {
      return "theme-risk";
    }
    if (content.includes("完成") || content.includes("通过") || content.includes("success")) {
      return "theme-success";
    }
    if (content.includes("分析") || content.includes("差异") || content.includes("附件")) {
      return "theme-analysis";
    }
    return "theme-default";
  };
  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const statusLabelMap: Record<IterationStatus, string> = {
    planned: "规划中",
    "in-progress": "进行中",
    review: "评审中",
    blocked: "阻塞中",
    completed: "已完成"
  };
  const renderStatusLabel = (status: IterationStatus) => statusLabelMap[status] ?? status;
  const diffLocations = analysisReport?.diffLocations ?? [];
  const diffAdded = analysisReport?.versionDiff?.added ?? [];
  const diffChanged = analysisReport?.versionDiff?.changed ?? [];
  const diffRemoved = analysisReport?.versionDiff?.removed ?? [];
  const agentPlan = analysisReport?.agentPlan;
  const agentPrompts = agentPlan?.prompts ?? [];
  const agentOutputs = analysisReport?.agentOutputs ?? [];
  const lifecycleAction = analysisReport?.lifecycleAction;
  const allowedTransitions = stateMachine?.allowedTransitions ?? [];
  const transitionHistory = stateMachine?.transitionHistory ?? [];
  const hasStateMachineActions = allowedTransitions.length > 0;
  const hasStateMachineHistory = transitionHistory.length > 0;
  const cyclePhaseLabelMap: Record<NonNullable<AttachmentAnalysisReport["cyclePhase"]>, string> = {
    "scope-clarified": "范围澄清",
    "task-planning": "任务规划",
    "build-in-progress": "开发执行",
    "qa-review": "测试评审",
    "ready-for-release": "发布就绪"
  };
  const cyclePhaseLabel =
    analysisReport?.cyclePhase && cyclePhaseLabelMap[analysisReport.cyclePhase]
      ? cyclePhaseLabelMap[analysisReport.cyclePhase]
      : analysisReport?.cyclePhase || "未定义";

  return (
    <>
      <article className="panel chat-panel">
        <div className="panel-head">
          <div className="panel-title-wrap">
            <button type="button" className="icon-btn" onClick={onSwitchToProjectPanel} aria-label="返回项目管理">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2>迭代内需求沟通</h2>
            <p className="hint">
              {currentIteration ? `当前迭代：${currentIteration.name}` : "请先在右侧选择迭代版本"}
            </p>
          </div>
        </div>

        <div className="iteration-meta-grid">
          <div className="info-box">
            <p className="hint">继承来源</p>
            <p>{contextData?.previous ? contextData.previous.name : "无（首个版本）"}</p>
          </div>
          <div className="info-box">
            <p className="hint">范围项</p>
            <p>in: {scopeInCount} / out: {scopeOutCount}</p>
          </div>
          <div className="info-box">
            <p className="hint">验收标准</p>
            <p>{acceptanceCount} 项</p>
          </div>
        </div>
        <div className={`info-box state-machine-box ${!hasStateMachineActions && !hasStateMachineHistory ? "compact" : ""}`}>
          <div className="state-machine-head">
            <p className="hint">迭代状态</p>
            <span className={`status-pill ${stateMachine?.currentStatus || currentIteration?.status || "planned"}`}>
              {renderStatusLabel(stateMachine?.currentStatus || currentIteration?.status || "planned")}
            </span>
          </div>
          {hasStateMachineActions ? (
            <div className="state-machine-actions">
              {allowedTransitions.map((status) => (
                <button key={status} type="button" className="btn ghost mini" onClick={() => onTransitionState(status)}>
                  流转到 {renderStatusLabel(status)}
                </button>
              ))}
            </div>
          ) : (
            <p className="hint state-machine-inline-hint">当前状态暂无可执行流转。</p>
          )}
          {hasStateMachineHistory ? (
            <ul className="state-transition-list">
              {transitionHistory.slice(0, 5).map((item) => (
                <li key={`${item.id}-${item.createdAt}`}>
                  <strong>
                    {renderStatusLabel(item.fromStatus)} → {renderStatusLabel(item.toStatus)}
                  </strong>
                  <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="chat-body">
          {chatMessages.length === 0 ? (
            <div className="empty-state">暂无消息，输入需求后开始沟通。</div>
          ) : (
            chatMessages.map((msg) => (
              <div key={`${msg.id}-${msg.createdAt}`} className={`msg-row msg-row-${msg.role}`}>
                {msg.role !== "user" ? (
                  <div className={`msg-avatar avatar-${msg.role}`} aria-hidden="true">
                    {getRoleAvatar(msg.role)}
                  </div>
                ) : null}
                <div className={`msg msg-${msg.role} ${getMsgKind(msg)} ${getMsgTheme(msg)}`}>
                  <div className="msg-meta">
                    <span>{getRoleLabel(msg.role)}</span>
                    <time dateTime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
                  </div>
                  <p>{msg.content}</p>
                  {getMsgKind(msg) === "event-analysis" && analysisReport && !isAnalyzingAttachment ? (
                    <div className="msg-inline-actions">
                      <button type="button" className="btn ghost mini attachment-report-entry" onClick={onOpenAnalysisPanel}>
                        查看分析报告
                      </button>
                    </div>
                  ) : null}
                </div>
                {msg.role === "user" ? (
                  <div className={`msg-avatar avatar-${msg.role}`} aria-hidden="true">
                    {getRoleAvatar(msg.role)}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="chat-input-row">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden-input"
            onChange={onUpload}
            accept=".fig,.sketch,.xd,.psd,.pdf,.jpg,.jpeg,.png,.doc,.docx,.txt,.md,.json"
          />
          <button
            type="button"
            className="icon-btn upload-icon-btn"
            onClick={onUploadClick}
            disabled={!currentIteration || isAnalyzingAttachment}
            aria-label={isAnalyzingAttachment ? "附件分析中" : "上传附件"}
            title={isAnalyzingAttachment ? "分析中..." : "上传附件"}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M6.2 8.6L3.9 10.9C3 11.8 3 13.2 3.9 14.1C4.8 15 6.2 15 7.1 14.1L11.9 9.3C13.1 8.1 13.1 6.2 11.9 5C10.7 3.8 8.8 3.8 7.6 5L2.8 9.8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <input
            value={chatInput}
            onChange={(event) => onChatInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onChatSend();
              }
            }}
            placeholder="输入需求或指令，例如：完成: 接口联调"
            aria-label="需求输入框"
          />
          <button type="button" className="btn primary" onClick={onChatSend} disabled={!chatInput.trim()}>
            发送
          </button>
        </div>
      </article>

      <div className={`analysis-drawer-mask ${showAnalysisPanel ? "open" : ""}`} onClick={onCloseAnalysisPanel} aria-hidden={!showAnalysisPanel} />
      <aside className={`panel preview-panel context-panel artifact-preview-panel analysis-drawer ${showAnalysisPanel ? "open" : ""}`}>
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <div className="panel-head">
            <h2>分析报告</h2>
            <div className="chat-tools">
              <button type="button" className="btn ghost mini" onClick={onCloseAnalysisPanel}>
                收起报告
              </button>
            </div>
          </div>
          <div className="preview-scroll">
            {!analysisReport ? (
              <div className="info-box">
                <p className="hint">暂无分析结果，请先上传附件。</p>
              </div>
            ) : (
              <>
                <div className="info-box">
                  <h3>理解结论</h3>
                  <p>{analysisReport.understanding}</p>
                  <p>附件：{analysisReport.fileName}</p>
                  <p>分析时间：{new Date(analysisReport.analyzedAt).toLocaleString("zh-CN")}</p>
                </div>
                <div className="info-box">
                  <h3>版本差异</h3>
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
                <div className="info-box">
                  <h3>风险提示</h3>
                  <p>{analysisReport.risks.join("；")}</p>
                </div>
                <div className="info-box">
                  <h3>Agent 执行方案</h3>
                  <p>阶段：{cyclePhaseLabel}</p>
                  <p>策略：{agentPlan?.strategy === "multi-agent" ? "多 Agent 协作" : "单 Agent 执行"}</p>
                  <p>Scope：{agentPlan?.scope ?? "full-cycle"}</p>
                  <p>推荐状态流转：{agentPlan?.recommendedTransition ?? "保持当前状态"}</p>
                  <p>目标：{agentPlan?.objective ?? "未生成"}</p>
                  {(agentPlan?.executionLoop ?? []).length > 0 ? (
                    <ul className="history-list">
                      {agentPlan?.executionLoop.map((item, index) => (
                        <li key={`loop-${index}`} className="history-item">
                          <strong>步骤 {index + 1}</strong>
                          <p>{item}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="info-box">
                  <h3>Agent Prompt</h3>
                  {agentPrompts.length === 0 ? (
                    <p>暂无 Prompt。</p>
                  ) : (
                    <ul className="history-list">
                      {agentPrompts.map((prompt) => (
                        <li key={prompt.agentId} className="history-item history-item-stack">
                          <strong>
                            {prompt.agentId} · {prompt.role}
                          </strong>
                          <p>goal: {prompt.goal}</p>
                          <p>scope: {prompt.scope}</p>
                          <pre className="agent-prompt-block">{`[system]\n${prompt.systemPrompt}\n\n[user]\n${prompt.userPrompt}\n\n[expected]\n${prompt.expectedOutput}`}</pre>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="info-box">
                  <h3>Agent 运行输出</h3>
                  {agentOutputs.length === 0 ? (
                    <p>暂无运行输出。</p>
                  ) : (
                    <ul className="history-list">
                      {agentOutputs.map((output) => (
                        <li key={`${output.agentId}-output`} className="history-item history-item-stack">
                          <strong>
                            {output.agentId} · {output.role} · {output.status}
                            {output.model ? ` · ${output.model}` : ""}
                          </strong>
                          {output.error ? <p>error: {output.error}</p> : null}
                          <pre className="agent-prompt-block">{output.content}</pre>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="info-box">
                  <h3>生命周期驱动结果</h3>
                  {!lifecycleAction ? (
                    <p>暂无状态驱动结果。</p>
                  ) : (
                    <>
                      <p>attempted: {lifecycleAction.attempted ? "yes" : "no"}</p>
                      <p>applied: {lifecycleAction.applied ? "yes" : "no"}</p>
                      <p>
                        transition: {lifecycleAction.fromStatus} -&gt; {lifecycleAction.toStatus ?? "保持"}
                      </p>
                      <p>{lifecycleAction.note}</p>
                    </>
                  )}
                </div>
                <div className="info-box">
                  <h3>建议动作</h3>
                  <p>{analysisReport.suggestions.join("；")}</p>
                </div>
              </>
            )}
          </div>
        </article>
      </aside>

    </>
  );
}
