import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api.js";

interface LogEntry {
  timestamp: string;
  level: number;
  levelLabel: string;
  msg: string;
  [key: string]: unknown;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "#6b7280",
  info: "#3b82f6",
  warn: "#f59e0b",
  error: "#dc2626",
};

const KNOWN_KEYS = new Set(["timestamp", "level", "levelLabel", "msg"]);

function extraFields(entry: LogEntry): Record<string, unknown> | null {
  const extras: Record<string, unknown> = {};
  let hasExtras = false;
  for (const key of Object.keys(entry)) {
    if (!KNOWN_KEYS.has(key)) {
      extras[key] = entry[key];
      hasExtras = true;
    }
  }
  return hasExtras ? extras : null;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const fetchLogs = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = level ? `?level=${level}` : "";
    apiFetch<LogEntry[]>(`/logs${params}`)
      .then((data) => {
        setLogs(data);
        setExpandedRows(new Set());
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [level]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="logs-page">
      <div className="logs-filters">
        <select className="logs-select" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">全部级别</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </div>

      {loading && <div className="logs-status">加载中…</div>}
      {error && <div className="logs-status logs-error">加载失败：{error}</div>}

      {!loading && !error && logs.length === 0 && <div className="logs-status">暂无日志记录</div>}

      {!loading && !error && logs.length > 0 && (
        <table className="logs-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>级别</th>
              <th>消息</th>
              <th>附加字段</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((entry, idx) => {
              const extras = extraFields(entry);
              const expanded = expandedRows.has(idx);
              return (
                <tr key={idx}>
                  <td className="logs-time">{new Date(entry.timestamp).toLocaleString()}</td>
                  <td>
                    <span
                      className="logs-level-badge"
                      style={{
                        color: LEVEL_COLORS[entry.levelLabel] || "#374151",
                        borderColor: LEVEL_COLORS[entry.levelLabel] || "#d1d5db",
                      }}
                    >
                      {entry.levelLabel}
                    </span>
                  </td>
                  <td className="logs-msg">{entry.msg}</td>
                  <td>
                    {extras ? (
                      <>
                        <button className="logs-expand-btn" onClick={() => toggleRow(idx)}>
                          {expanded ? "收起" : "展开"}
                        </button>
                        {expanded && (
                          <pre className="logs-extras-json">{JSON.stringify(extras, null, 2)}</pre>
                        )}
                      </>
                    ) : (
                      <span className="logs-no-extras">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
