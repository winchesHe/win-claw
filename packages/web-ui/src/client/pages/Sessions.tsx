import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

interface SessionInfo {
  sessionId: string;
  messageCount: number;
  lastActiveAt: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SessionInfo[]>("/sessions")
      .then((data: SessionInfo[]) => setSessions(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  function handleSelectSession(sessionId: string) {
    setSelectedId(sessionId);
    setMessages([]);
    setMsgError(null);
    setMsgLoading(true);
    apiFetch<Message[]>(`/sessions/${sessionId}/messages`)
      .then((data: Message[]) => setMessages(data))
      .catch((err: unknown) => setMsgError(err instanceof Error ? err.message : String(err)))
      .finally(() => setMsgLoading(false));
  }

  const roleLabel: Record<string, string> = {
    user: "用户",
    assistant: "助手",
    system: "系统",
    tool: "工具",
  };

  if (loading) {
    return <div className="sessions-status">加载中…</div>;
  }

  if (error) {
    return <div className="sessions-status sessions-error">加载失败：{error}</div>;
  }

  return (
    <div className="sessions-layout">
      <div className="sessions-list">
        <h3 className="sessions-list-title">会话列表</h3>
        {sessions.length === 0 ? (
          <p className="sessions-empty">暂无会话</p>
        ) : (
          <ul className="sessions-items">
            {sessions.map((s) => (
              <li
                key={s.sessionId}
                className={`sessions-item${selectedId === s.sessionId ? " selected" : ""}`}
                onClick={() => handleSelectSession(s.sessionId)}
              >
                <div className="sessions-item-id">{s.sessionId}</div>
                <div className="sessions-item-meta">
                  <span>{s.messageCount} 条消息</span>
                  <span>{new Date(s.lastActiveAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sessions-messages">
        {!selectedId && <p className="sessions-placeholder">请选择一个会话查看消息</p>}
        {selectedId && msgLoading && <p className="sessions-status">加载消息中…</p>}
        {selectedId && msgError && (
          <p className="sessions-status sessions-error">加载消息失败：{msgError}</p>
        )}
        {selectedId && !msgLoading && !msgError && messages.length === 0 && (
          <p className="sessions-placeholder">该会话暂无消息</p>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`sessions-msg sessions-msg-${msg.role}`}>
            <div className="sessions-msg-role">{roleLabel[msg.role] ?? msg.role}</div>
            {msg.role === "tool" && msg.toolCallId && (
              <div className="sessions-msg-tool-id">toolCallId: {msg.toolCallId}</div>
            )}
            {msg.content && <div className="sessions-msg-content">{msg.content}</div>}
            {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="sessions-msg-toolcalls">
                <div className="sessions-msg-toolcalls-title">工具调用：</div>
                {msg.toolCalls.map((tc) => (
                  <div key={tc.id} className="sessions-msg-toolcall">
                    <span className="sessions-msg-toolcall-name">{tc.name}</span>
                    <pre className="sessions-msg-toolcall-args">{tc.arguments}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
