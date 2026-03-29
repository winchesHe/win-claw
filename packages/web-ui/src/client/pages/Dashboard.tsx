import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

interface SessionInfo {
  sessionId: string;
  messageCount: number;
  lastActiveAt: string;
}

interface ToolLog {
  id: string;
  toolName: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  sessionId?: string;
  createdAt: string;
}

interface SystemStatus {
  sessionCount: number;
  recentSession: SessionInfo | null;
  memoryCount: number;
  pendingTaskCount: number;
  recentToolLogs: ToolLog[];
}

export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SystemStatus>("/status")
      .then((data: SystemStatus) => setStatus(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="dashboard-loading">加载中…</div>;
  }

  if (error) {
    return <div className="dashboard-error">加载失败：{error}</div>;
  }

  if (!status) {
    return null;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-cards">
        <div className="dashboard-card">
          <div className="dashboard-card-label">会话总数</div>
          <div className="dashboard-card-value">{status.sessionCount}</div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-label">最近活跃会话</div>
          <div className="dashboard-card-value">
            {status.recentSession ? (
              <>
                <span className="dashboard-session-id">{status.recentSession.sessionId}</span>
                <span className="dashboard-session-time">
                  {new Date(status.recentSession.lastActiveAt).toLocaleString()}
                </span>
              </>
            ) : (
              <span className="dashboard-empty">无</span>
            )}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-label">长期记忆数</div>
          <div className="dashboard-card-value">{status.memoryCount}</div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-label">待执行任务数</div>
          <div className="dashboard-card-value">{status.pendingTaskCount}</div>
        </div>
      </div>

      <h3 className="dashboard-section-title">最近工具执行记录</h3>
      {status.recentToolLogs.length === 0 ? (
        <p className="dashboard-empty">暂无工具执行记录</p>
      ) : (
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>工具名称</th>
              <th>执行时间</th>
              <th>耗时 (ms)</th>
            </tr>
          </thead>
          <tbody>
            {status.recentToolLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.toolName}</td>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
                <td>{log.durationMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
