import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api.js";

interface ToolLog {
  id: string;
  toolName: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  sessionId?: string;
  createdAt: string;
}

export default function ToolLogs() {
  const [logs, setLogs] = useState<ToolLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toolName, setToolName] = useState("");
  const [sessionId, setSessionId] = useState("");

  const fetchLogs = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (toolName) params.set("toolName", toolName);
    if (sessionId) params.set("sessionId", sessionId);
    apiFetch<ToolLog[]>(`/tool-logs?${params}`)
      .then((data: ToolLog[]) => setLogs(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [toolName, sessionId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="tool-logs">
      <div className="tool-logs-filters">
        <input
          className="tool-logs-input"
          type="text"
          placeholder="按工具名称筛选"
          value={toolName}
          onChange={(e) => setToolName(e.target.value)}
        />
        <input
          className="tool-logs-input"
          type="text"
          placeholder="按会话 ID 筛选"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        />
      </div>

      {loading && <div className="tool-logs-status">加载中…</div>}
      {error && <div className="tool-logs-status tool-logs-error">加载失败：{error}</div>}

      {!loading && !error && logs.length === 0 && (
        <div className="tool-logs-status">暂无工具执行日志</div>
      )}

      {!loading && !error && logs.length > 0 && (
        <table className="tool-logs-table">
          <thead>
            <tr>
              <th>工具名称</th>
              <th>输入参数</th>
              <th>输出结果</th>
              <th>耗时 (ms)</th>
              <th>执行时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="tool-logs-name">{log.toolName}</td>
                <td>
                  <pre className="tool-logs-json">{JSON.stringify(log.input, null, 2)}</pre>
                </td>
                <td>
                  <pre className="tool-logs-json">{JSON.stringify(log.output, null, 2)}</pre>
                </td>
                <td className="tool-logs-duration">{log.durationMs}</td>
                <td className="tool-logs-time">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
