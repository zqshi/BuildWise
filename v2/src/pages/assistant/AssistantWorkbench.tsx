import { useState, useEffect, useRef } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import { sendAssistantMessage, fetchAssistantMessages, clearAssistantMessages, type AssistantMessage } from "../../app/workspaceApiAssistant";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(md.render(text), { FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });
}

type AssistantWorkbenchProps = {
  tenantId: string;
  onBack: () => void;
};

const SUGGESTIONS = [
  "帮我查一下跨项目中关于性能优化的经验",
  "各项目最近有什么共性风险？",
  "当前的经验沉淀策略是什么？",
  "把自动提取的置信度阈值调到 80",
];

export function AssistantWorkbench({ tenantId, onBack }: AssistantWorkbenchProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAssistantMessages(tenantId).then((msgs) => {
      setMessages(msgs);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [tenantId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    const optimistic: AssistantMessage = {
      id: Date.now(),
      tenantId,
      role: "user",
      content: text,
      metadata: {},
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const resp = await sendAssistantMessage(tenantId, text);
      setMessages(resp.messages);
    } catch {
      setMessages((prev) => [...prev, {
        id: Date.now() + 1,
        tenantId,
        role: "assistant",
        content: "网络异常，请稍后重试。",
        metadata: {},
        createdAt: new Date().toISOString()
      }]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleClear = async () => {
    await clearAssistantMessages(tenantId);
    setMessages([]);
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="assistant-workbench">
      {/* Header */}
      <div className="assistant-header">
        <button className="btn ghost mini" onClick={onBack}>← 返回</button>
        <h2 className="assistant-title">业务助手 · 项目大管家</h2>
        <div style={{ flex: 1 }} />
        {messages.length > 0 && (
          <button className="btn ghost mini" onClick={() => void handleClear()}>清空对话</button>
        )}
      </div>

      {/* Chat body */}
      <div className="chat-body" ref={scrollRef}>
        {!loaded && (
          <div className="empty-state">加载中...</div>
        )}

        {loaded && messages.length === 0 && (
          <div className="assistant-welcome">
            <div className="assistant-welcome-avatar">管</div>
            <p className="assistant-welcome-title">你好，我是项目大管家</p>
            <p className="assistant-welcome-desc">
              我可以帮你搜索跨项目经验、生成全景洞察、调整经验沉淀策略。
            </p>
            <div className="assistant-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="assistant-suggestion-chip" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`msg-row msg-row-${msg.role}`}>
            {msg.role === "assistant" && (
              <div className="msg-avatar avatar-assistant">管</div>
            )}
            <div className={`msg msg-${msg.role}`}>
              <div className="msg-meta">
                <span>{msg.role === "user" ? "我" : "大管家"}</span>
                <time dateTime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
              </div>
              {msg.role === "assistant" ? (
                <div className="msg-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="msg-row msg-row-assistant">
            <div className="msg-avatar avatar-assistant">管</div>
            <div className="msg msg-assistant msg-typing">
              <div className="typing-indicator">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
              <p className="typing-status-text">思考中...</p>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="chat-input-row assistant-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="跟大管家说点什么..."
          rows={1}
        />
        <button
          className="btn primary"
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
        >
          发送
        </button>
      </div>
    </div>
  );
}
