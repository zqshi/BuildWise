import { useEffect, useState } from "react";
import { fetchOpenclawIntegrationStatus, sendOpenclawGlobalChat, type OpenclawIntegrationStatusPayload } from "../../app/workspaceApi";
import { presentOpenclawMessage } from "./openclawMessagePresenter";
import { composeOpenclawGlobalMessage, type OpenclawDialogMode } from "./openclawPromptComposer";

type Props = {
  isAdmin: boolean;
  onBack: () => void;
};
type ChatLine = { role: "admin" | "openclaw"; content: string; at: string; mode?: string; profile?: string; agentId?: string };

export function OpenclawWorkspacePanel({ isAdmin, onBack }: Props) {
  const [integrationStatus, setIntegrationStatus] = useState<OpenclawIntegrationStatusPayload | null>(null);
  const [statusError, setStatusError] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [dialogMode, setDialogMode] = useState<OpenclawDialogMode>("native");
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);

  useEffect(() => {
    fetchOpenclawIntegrationStatus()
      .then((status) => {
        setIntegrationStatus(status);
        setStatusError("");
      })
      .catch((error) => {
        setStatusError(error instanceof Error ? error.message : "OpenClaw 状态检测失败");
      });
  }, []);

  const handleSend = async () => {
    const message = chatInput.trim();
    if (!isAdmin || !message) return;
    setChatLines((prev) => [...prev, { role: "admin", content: message, at: new Date().toISOString() }]);
    setChatInput("");
    try {
      setChatBusy(true);
      const payload = composeOpenclawGlobalMessage(message, dialogMode);
      const result = await sendOpenclawGlobalChat(payload, "owner");
      setChatLines((prev) => [
        ...prev,
        { role: "openclaw", content: result.reply, at: result.at, mode: result.mode, profile: result.profile, agentId: result.agentId }
      ]);
    } catch (error) {
      setChatLines((prev) => [
        ...prev,
        { role: "openclaw", content: error instanceof Error ? error.message : "OpenClaw 编排对话失败", at: new Date().toISOString() }
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <section className="openclaw-workspace">
      <article className="panel openclaw-chat-shell">
        <div className="panel-head openclaw-chat-head">
          <h2>OpenClaw 对话式流程编排中心</h2>
          <button type="button" className="btn ghost mini" onClick={onBack}>
            返回工作台
          </button>
        </div>
        <div className="openclaw-chat-scroll">
          {!isAdmin ? (
            <section className="openclaw-msg assistant">
              <div className="openclaw-msg-meta">
                <strong>权限提示</strong>
                <span>只读</span>
              </div>
              <p>当前账号不是 owner。你可以查看编排对话结果，但不能提交编排配置。</p>
            </section>
          ) : null}
          {statusError ? (
            <section className="openclaw-msg assistant">
              <div className="openclaw-msg-meta">
                <strong>系统提示</strong>
                <span>状态检测失败</span>
              </div>
              <p>{statusError}</p>
            </section>
          ) : null}
          {integrationStatus && !integrationStatus.integrated ? (
            <section className="openclaw-msg assistant">
              <div className="openclaw-msg-meta">
                <strong>系统提示</strong>
                <span>集成异常</span>
              </div>
              <p>{`OpenClaw 未就绪：${integrationStatus.reason}`}</p>
              {integrationStatus.reason === "openclaw auth missing" ? <p>{`请先完成鉴权配置：${integrationStatus.authProfilePath}`}</p> : null}
            </section>
          ) : null}
          {chatLines.length > 0 ? (
            <ul className="openclaw-msg-list">
              {chatLines.map((item, idx) => (
                <li key={`${item.at}-${idx}`} className={`openclaw-msg ${item.role === "admin" ? "admin" : "assistant"}`}>
                  <div className="openclaw-msg-meta">
                    <strong>{item.role === "admin" ? "你" : "OpenClaw"}</strong>
                    <span>{new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {item.role === "openclaw" ? (
                    <>
                      {item.mode || item.profile || item.agentId ? (
                        <p className="openclaw-runtime-meta">
                          运行来源：{item.mode || "unknown"} / {item.profile || "-"} / {item.agentId || "-"}
                        </p>
                      ) : null}
                      {(() => {
                        const presented = presentOpenclawMessage(item.content);
                        if (presented.kind === "plain") {
                          return <p>{presented.text}</p>;
                        }
                        return (
                          <div className="openclaw-structured">
                            <p className="openclaw-structured-summary">
                              <strong>状态：{presented.data.status}</strong>
                              <br />
                              {presented.data.summary}
                            </p>
                            {presented.data.questions.length > 0 ? (
                              <div>
                                <strong>待确认</strong>
                                <ul>
                                  {presented.data.questions.map((question, qIdx) => (
                                    <li key={`${idx}-q-${qIdx}`}>{question}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {presented.data.nextActions.length > 0 ? (
                              <div>
                                <strong>建议动作</strong>
                                <ul>
                                  {presented.data.nextActions.map((action, aIdx) => (
                                    <li key={`${idx}-a-${aIdx}`}>{action}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {presented.data.risks.length > 0 ? (
                              <div>
                                <strong>风险</strong>
                                <ul>
                                  {presented.data.risks.map((risk, rIdx) => (
                                    <li key={`${idx}-r-${rIdx}`}>{risk}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {presented.data.evidence.length > 0 ? (
                              <div>
                                <strong>证据</strong>
                                <ul>
                                  {presented.data.evidence.map((evidence, eIdx) => (
                                    <li key={`${idx}-e-${eIdx}`}>{evidence}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {presented.data.flowRoute ? (
                              <div>
                                <strong>推进路线</strong>
                                <p>{presented.data.flowRoute}</p>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p>{item.content}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="openclaw-empty">在下方输入全局编排需求，例如：统一“澄清-边界-开发-测试-发布”的门禁条件。</div>
          )}
        </div>
        <div className="openclaw-composer">
          <div className="openclaw-composer-mode">
            <label>
              对话模式
              <select
                value={dialogMode}
                onChange={(event) => setDialogMode(event.target.value as OpenclawDialogMode)}
                disabled={!isAdmin || chatBusy || (integrationStatus !== null && !integrationStatus.integrated)}
              >
                <option value="native">原生自然语言（推荐）</option>
                <option value="orchestration">编排约束模式</option>
              </select>
            </label>
            <span className="hint">
              {dialogMode === "native" ? "直接发送你的原始问题，不追加模板约束。" : "发送前会追加主窗口编排治理约束。"}
            </span>
          </div>
          <div className="openclaw-composer-row">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={dialogMode === "native" ? "输入你的问题（将按原生自然语言发送）" : "输入流程编排需求（主窗口仅编排，不执行）"}
              disabled={!isAdmin || chatBusy || (integrationStatus !== null && !integrationStatus.integrated)}
            />
            <button
              type="button"
              className="btn primary"
              onClick={handleSend}
              disabled={!isAdmin || chatBusy || !chatInput.trim() || (integrationStatus !== null && !integrationStatus.integrated)}
            >
              {chatBusy ? "编排中..." : "发送"}
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
