import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api.js";

interface MemorySummary {
  longTerm: { count: number; avgImportance: number };
  working: { count: number; activeCount: number };
  episodic: { totalMessages: number; vectorizedCount: number };
}

interface Memory {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  importance: number;
}

export default function Memories() {
  const [summary, setSummary] = useState<MemorySummary | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<MemorySummary>("/memories/summary"),
      apiFetch<Memory[]>("/memories"),
    ]).then(
      ([summaryData, memoriesData]: [MemorySummary, Memory[]]) => {
        setSummary(summaryData);
        setMemories(memoriesData);
        setLoading(false);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      },
    );
  }, []);

  const handleSearch = useCallback(() => {
    if (!query.trim()) {
      setSearching(true);
      apiFetch<Memory[]>("/memories")
        .then((data: Memory[]) => setMemories(data))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setSearching(false));
      return;
    }
    setSearching(true);
    setError(null);
    const params = new URLSearchParams({ query: query.trim() });
    apiFetch<Memory[]>(`/memories/search?${params}`)
      .then((data: Memory[]) => setMemories(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSearching(false));
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  if (loading) {
    return <div className="memories-status">加载中…</div>;
  }

  if (error && !summary) {
    return <div className="memories-status memories-error">加载失败：{error}</div>;
  }

  return (
    <div className="memories-page">
      {summary && (
        <div className="dashboard-cards">
          <div className="dashboard-card">
            <div className="dashboard-card-label">长期记忆数</div>
            <div className="dashboard-card-value">{summary.longTerm.count}</div>
          </div>
          <div className="dashboard-card">
            <div className="dashboard-card-label">平均重要性</div>
            <div className="dashboard-card-value">{summary.longTerm.avgImportance.toFixed(2)}</div>
          </div>
          <div className="dashboard-card">
            <div className="dashboard-card-label">工作记忆数</div>
            <div className="dashboard-card-value">{summary.working.count}</div>
          </div>
          <div className="dashboard-card">
            <div className="dashboard-card-label">情景消息数</div>
            <div className="dashboard-card-value">{summary.episodic.totalMessages}</div>
          </div>
        </div>
      )}

      <div className="memories-search">
        <input
          className="memories-search-input"
          type="text"
          placeholder="语义搜索记忆…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="memories-search-btn" onClick={handleSearch} disabled={searching}>
          {searching ? "搜索中…" : "搜索"}
        </button>
      </div>

      {error && <div className="memories-status memories-error">{error}</div>}

      {!searching && memories.length === 0 && <div className="memories-status">暂无记忆条目</div>}

      {memories.length > 0 && (
        <div className="memories-list">
          {memories.map((mem) => (
            <div className="memories-card" key={mem.id}>
              <div className="memories-card-content">{mem.content}</div>
              <div className="memories-card-meta">
                <span className="memories-card-importance">
                  重要性：{mem.importance.toFixed(2)}
                </span>
                <span className="memories-card-time">
                  {new Date(mem.createdAt).toLocaleString()}
                </span>
              </div>
              {mem.tags.length > 0 && (
                <div className="memories-card-tags">
                  {mem.tags.map((tag) => (
                    <span className="memories-tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
