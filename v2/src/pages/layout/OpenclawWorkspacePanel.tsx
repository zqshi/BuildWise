import { useEffect, useRef, useState } from "react";
import {
  fetchOpenclawIntegrationStatus,
  fetchOpenclawConversations,
  fetchOpenclawConversationMessages,
  createOpenclawConversation,
  sendOpenclawConversationMessage,
  type OpenclawIntegrationStatusPayload,
  type OpenclawGlobalMessagePayload
} from "../../app/workspaceApi";
import { presentOpenclawMessage } from "./openclawMessagePresenter";
import { composeOpenclawGlobalMessage, type OpenclawDialogMode } from "./openclawPromptComposer";

type Props = {
  isAdmin: boolean;
  onBack: () => void;
};
type ChatLine = { id: string; role: "admin" | "openclaw"; content: string; at: string; metadata?: Record<string, unknown> };

function mapMessageToChatLine(m: OpenclawGlobalMessagePayload): ChatLine {
  return {
    id: m.id,
    role: m.role === "user" ? "admin" : "openclaw",
    content: m.content,
    at: m.createdAt,
    metadata: m.metadata
  };
}

export function OpenclawWorkspacePanel({ isAdmin, onBack }: Props) {
  const [integrationStatus, setIntegrationStatus] = useState<OpenclawIntegrationStatusPayload | null>(null);
  const [statusError, setStatusError] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [dialogMode, setDialogMode] = useState<OpenclawDialogMode>("native");
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatLines]);

  // Load integration status + conversation on mount
  useEffect(() => {
    fetchOpenclawIntegrationStatus()
      .then((status) => {
        setIntegrationStatus(status);
        setStatusError("");
      })
      .catch((error) => {
        setStatusError(error instanceof Error ? error.message : "OpenClaw 状态检测失败");
      });

    initConversation();
  }, []);

  async function initConversation() {
    try {
      setLoading(true);
      const conversations = await fetchOpenclawConversations();
      const active = conversations.filter((c) => c.status === "active");
      let targetId: string;
      if (active.length > 0) {
        // Use the most recently updated conversation
        const sorted = active.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        targetId = sorted[0].id;
      } else {
        const created = await createOpenclawConversation();
        targetId = created.id;
      }
      setConversationId(targetId);
      const messages = await fetchOpenclawConversationMessages(targetId);
      setChatLines(messages.map(mapMessageToChatLine));
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "加载对话历史失败");
    } finally {
      setLoading(false);
    }
  }

  const handleNewConversation = async () => {
    try {
      setLoading(true);
      const created = await createOpenclawConversation();
      setConversationId(created.id);
      setChatLines([]);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "创建对话失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const message = chatInput.trim();
    if (!isAdmin || !message || !conversationId) return;

    const optimisticUserLine: ChatLine = {
      id: `temp-${Date.now()}`,
      role: "admin",
      content: message,
      at: new Date().toISOString()
    };
    setChatLines((prev) => [...prev, optimisticUserLine]);
    setChatInput("");

    try {
      setChatBusy(true);
      const effectiveMessage = dialogMode === "native" ? message : composeOpenclawGlobalMessage(message, dialogMode);
      const result = await sendOpenclawConversationMessage(conversationId, effectiveMessage);
      // Replace optimistic user line with real one, add assistant
      setChatLines((prev) => {
        const withoutOptimistic = prev.filter((line) => line.id !== optimisticUserLine.id);
        return [
          ...withoutOptimistic,
          mapMessageToChatLine(result.userMessage),
          mapMessageToChatLine(result.assistantMessage)
        ];
      });
    } catch (error) {
      setChatLines((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "openclaw", content: error instanceof Error ? error.message : "对话失败", at: new Date().toISOString() }
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <section className="openclaw-workspace">
      <article className="panel openclaw-chat-shell">
        <div className="panel-head openclaw-chat-head">
          <h2>业务助手</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {isAdmin ? (
              <button type="button" className="btn ghost mini" onClick={handleNewConversation} disabled={loading || chatBusy}>
                新建对话
              </button>
            ) : null}
            <button type="button" className="btn ghost mini" onClick={onBack}>
              返回工作台
            </button>
          </div>
        </div>
        <div className="openclaw-chat-scroll" ref={scrollRef}>
          {!isAdmin ? (
            <section className="openclaw-msg assistant">
              <div className="openclaw-msg-meta">
                <strong>权限提示</strong>
                <span>只读</span>
              </div>
              <p>当前账号不是 owner。你可以查看对话结果，但不能发送消息。</p>
            </section>
          ) : null}
          {statusError ? (
            <section className="openclaw-msg assistant">
              <div className="openclaw-msg-meta">
                <strong>系统提示</strong>
                <span>异常</span>
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
            </section>
          ) : null}
          {loading ? (
            <div className="openclaw-empty">正在加载对话历史…</div>
          ) : chatLines.length > 0 ? (
            <ul className="openclaw-msg-list">
              {chatLines.map((item, idx) => (
                <li key={item.id || `${item.at}-${idx}`} className={`openclaw-msg ${item.role === "admin" ? "admin" : "assistant"}`}>
                  <div className="openclaw-msg-meta">
                    <strong>{item.role === "admin" ? "你" : "业务助手"}</strong>
                    <span>{new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {item.role === "openclaw" ? (
                    (() => {
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
                    })()
                  ) : (
                    <p>{item.content}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="openclaw-empty">这是一个新的对话。在下方输入你的问题，业务助手会帮你理清思路、制定策略。</div>
          )}
        </div>
        <div className="openclaw-composer">
          <div className="openclaw-composer-mode">
            <label>
              对话模式
              <select
                value={dialogMode}
                onChange={(event) => setDialogMode(event.target.value as OpenclawDialogMode)}
                disabled={!isAdmin || chatBusy || loading}
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
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={dialogMode === "native" ? "输入你的问题" : "输入流程编排需求"}
              disabled={!isAdmin || chatBusy || loading || !conversationId}
            />
            <button
              type="button"
              className="btn primary"
              onClick={handleSend}
              disabled={!isAdmin || chatBusy || !chatInput.trim() || loading || !conversationId}
            >
              {chatBusy ? "思考中..." : "发送"}
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
