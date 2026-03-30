import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

interface McpSourceView {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  envKeys: string[];
  env?: Record<string, string>;
  sourceLabel: string;
  scope: "project" | "global" | "yaml";
  ideType: "cursor" | "claude" | "codex" | "kiro" | "config-yaml";
  editable: boolean;
  active: boolean;
  shadowedBy?: string;
  issues: string[];
}

interface McpListItemView {
  name: string;
  activeSource: McpSourceView;
  status: "connected" | "failed" | "disconnected" | "unknown";
  toolCount: number | null;
  error?: string;
  sourceCount: number;
  shadowedCount: number;
}

interface McpDetailView {
  item: McpListItemView;
  sources: McpSourceView[];
}

interface McpConnectionTestResult {
  name: string;
  status: "connected" | "failed";
  toolCount: number;
  stage: "validation" | "connection" | "discovery";
  message: string;
  error?: string;
}

const EMPTY_FORM = {
  name: "",
  transport: "stdio" as "stdio" | "sse",
  command: "",
  argsText: "",
  url: "",
  envText: "",
};

export default function Mcp() {
  const [servers, setServers] = useState<McpListItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<McpDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | McpListItemView["status"]>("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "project" | "global" | "yaml">("all");
  const [testResult, setTestResult] = useState<McpConnectionTestResult | null>(null);

  function loadServers(preferredName?: string) {
    setLoading(true);
    setError(null);
    apiFetch<McpListItemView[]>("/plugins/mcp")
      .then((data) => {
        setServers(data);
        if (data.length === 0) {
          setSelectedName(null);
          return;
        }
        const fallback = preferredName && data.some((server) => server.name === preferredName);
        setSelectedName(fallback ? preferredName : data[0].name);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadServers();
  }, []);

  useEffect(() => {
    if (!selectedName) return;
    setDetailLoading(true);
    setDetailError(null);
    apiFetch<McpDetailView>(`/plugins/mcp/${selectedName}`)
      .then((data) => {
        setDetail(data);
        if (!editing) {
          setForm({
            name: data.item.name,
            transport: data.item.activeSource.transport,
            command: data.item.activeSource.command ?? "",
            argsText: (data.item.activeSource.args ?? []).join("\n"),
            url: data.item.activeSource.url ?? "",
            envText: Object.entries(data.item.activeSource.env ?? {})
              .map(([key, value]) => `${key}=${value}`)
              .join("\n"),
          });
        }
      })
      .catch((err: unknown) => {
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setDetailLoading(false));
  }, [selectedName, editing]);

  function handleCreate() {
    setEditing(true);
    setSelectedName(null);
    setDetail(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function handleEdit() {
    if (!detail) return;
    setEditing(true);
    setForm({
      name: detail.item.name,
      transport: detail.item.activeSource.transport,
      command: detail.item.activeSource.command ?? "",
      argsText: (detail.item.activeSource.args ?? []).join("\n"),
      url: detail.item.activeSource.url ?? "",
      envText: Object.entries(detail.item.activeSource.env ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
    });
    setFormError(null);
  }

  function handleSave() {
    setSaving(true);
    setFormError(null);
    setTestResult(null);
    const method = selectedName ? "PUT" : "POST";
    const path = selectedName ? `/plugins/mcp/${selectedName}` : "/plugins/mcp";

    const env = Object.fromEntries(
      form.envText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [key, ...rest] = line.split("=");
          return [key, rest.join("=") || ""];
        }),
    );

    apiFetch(path, {
      method,
      body: JSON.stringify({
        name: form.name,
        transport: form.transport,
        command: form.command || undefined,
        args: form.argsText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        url: form.url || undefined,
        env,
      }),
    })
      .then(() => {
        setEditing(false);
        loadServers(form.name);
      })
      .catch((err: unknown) => setFormError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!selectedName) return;
    setSaving(true);
    setFormError(null);
    setTestResult(null);
    apiFetch(`/plugins/mcp/${selectedName}`, { method: "DELETE" })
      .then(() => {
        setEditing(false);
        setDetail(null);
        loadServers();
      })
      .catch((err: unknown) => setFormError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  function handleTestConnection() {
    setSaving(true);
    setFormError(null);
    setTestResult(null);

    const env = Object.fromEntries(
      form.envText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [key, ...rest] = line.split("=");
          return [key, rest.join("=") || ""];
        }),
    );

    apiFetch<McpConnectionTestResult>("/plugins/mcp/test", {
      method: "POST",
      body: JSON.stringify({
        name: form.name || "temp-server",
        transport: form.transport,
        command: form.command || undefined,
        args: form.argsText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        url: form.url || undefined,
        env,
      }),
    })
      .then((result) => setTestResult(result))
      .catch((err: unknown) => setFormError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  if (loading) {
    return <div className="plugin-status">加载 MCP 中…</div>;
  }

  if (error) {
    return <div className="plugin-status plugin-error">加载失败：{error}</div>;
  }

  const filteredServers = servers.filter((server) => {
    const matchesSearch = server.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || server.status === statusFilter;
    const matchesScope = scopeFilter === "all" || server.activeSource.scope === scopeFilter;
    return matchesSearch && matchesStatus && matchesScope;
  });

  return (
    <div className="plugin-layout">
      <div className="plugin-list-panel">
        <div className="plugin-panel-header">
          <h3>MCP</h3>
          <button className="plugin-action-btn" onClick={handleCreate}>
            新建
          </button>
        </div>
        <div className="plugin-toolbar">
          <input
            className="plugin-search"
            placeholder="搜索 MCP"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">全部状态</option>
            <option value="connected">connected</option>
            <option value="failed">failed</option>
            <option value="disconnected">disconnected</option>
            <option value="unknown">unknown</option>
          </select>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)}
          >
            <option value="all">全部来源</option>
            <option value="project">项目级</option>
            <option value="global">全局</option>
            <option value="yaml">YAML</option>
          </select>
        </div>
        {filteredServers.length === 0 ? (
          <p className="plugin-empty">当前未发现可展示的 MCP Servers</p>
        ) : (
          <ul className="plugin-list">
            {filteredServers.map((server) => (
              <li
                key={server.name}
                className={`plugin-list-item${selectedName === server.name ? " selected" : ""}`}
                onClick={() => {
                  setEditing(false);
                  setSelectedName(server.name);
                }}
              >
                <div className="plugin-item-title-row">
                  <div className="plugin-item-title">{server.name}</div>
                  <span className={`plugin-badge status-${server.status}`}>{server.status}</span>
                </div>
                <div className="plugin-item-desc">
                  {server.activeSource.transport} · {server.activeSource.sourceLabel}
                </div>
                <div className="plugin-item-meta">
                  {server.toolCount === null ? "toolCount unknown" : `${server.toolCount} tools`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="plugin-detail-panel">
        {editing ? (
          <div className="plugin-detail plugin-form-wrap">
            <div className="plugin-panel-header">
              <h3>{selectedName ? `编辑 ${selectedName}` : "新建 MCP Server"}</h3>
              <span>项目级 /.codex</span>
            </div>
            <div className="plugin-form">
              <label>
                <span>名称</span>
                <input
                  value={form.name}
                  disabled={Boolean(selectedName)}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label>
                <span>Transport</span>
                <select
                  value={form.transport}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, transport: e.target.value as "stdio" | "sse" }))
                  }
                >
                  <option value="stdio">stdio</option>
                  <option value="sse">sse</option>
                </select>
              </label>
              {form.transport === "stdio" ? (
                <>
                  <label>
                    <span>Command</span>
                    <input
                      value={form.command}
                      onChange={(e) => setForm((prev) => ({ ...prev, command: e.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Args</span>
                    <textarea
                      rows={6}
                      value={form.argsText}
                      onChange={(e) => setForm((prev) => ({ ...prev, argsText: e.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <label>
                  <span>URL</span>
                  <input
                    value={form.url}
                    onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                  />
                </label>
              )}
              <label>
                <span>Env (KEY=VALUE)</span>
                <textarea
                  rows={6}
                  value={form.envText}
                  onChange={(e) => setForm((prev) => ({ ...prev, envText: e.target.value }))}
                />
              </label>
              {formError && <div className="plugin-form-error">{formError}</div>}
              {testResult && (
                <div
                  className={
                    testResult.status === "connected"
                      ? "plugin-test-result success"
                      : "plugin-test-result failure"
                  }
                >
                  <div className="plugin-test-result-title">
                    {testResult.status === "connected" ? "连接成功" : "连接失败"}
                  </div>
                  <div className="plugin-test-result-line">阶段：{testResult.stage}</div>
                  <div className="plugin-test-result-line">摘要：{testResult.message}</div>
                  <div className="plugin-test-result-line">工具数：{testResult.toolCount}</div>
                  {testResult.error && (
                    <pre className="plugin-preview plugin-test-error">{testResult.error}</pre>
                  )}
                </div>
              )}
              <div className="plugin-actions">
                <button
                  className="plugin-action-btn primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
                <button
                  className="plugin-action-btn"
                  onClick={handleTestConnection}
                  disabled={saving}
                >
                  {saving ? "处理中…" : "测试连接"}
                </button>
                <button
                  className="plugin-action-btn"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {!selectedName && <p className="plugin-empty">请选择一个 MCP Server 查看详情</p>}
            {selectedName && detailLoading && <p className="plugin-status">加载详情中…</p>}
            {selectedName && detailError && (
              <p className="plugin-status plugin-error">加载详情失败：{detailError}</p>
            )}
            {detail && !detailLoading && !detailError && (
              <div className="plugin-detail">
                <div className="plugin-panel-header">
                  <h3>{detail.item.name}</h3>
                  <div className="plugin-actions compact">
                    <button className="plugin-action-btn" onClick={handleEdit}>
                      编辑
                    </button>
                    <button
                      className="plugin-action-btn danger"
                      onClick={handleDelete}
                      disabled={saving}
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="plugin-section">
                  <div className="plugin-section-title">当前生效</div>
                  <div className="plugin-kv-grid">
                    <div>来源</div>
                    <div>{detail.item.activeSource.sourceLabel}</div>
                    <div>Transport</div>
                    <div>{detail.item.activeSource.transport}</div>
                    <div>Command / URL</div>
                    <div>
                      {detail.item.activeSource.transport === "stdio"
                        ? [
                            detail.item.activeSource.command,
                            ...(detail.item.activeSource.args ?? []),
                          ]
                            .filter(Boolean)
                            .join(" ") || "--"
                        : detail.item.activeSource.url || "--"}
                    </div>
                    <div>Env Keys</div>
                    <div>
                      {detail.item.activeSource.envKeys.length > 0
                        ? detail.item.activeSource.envKeys.join(", ")
                        : "无"}
                    </div>
                  </div>
                </div>

                <div className="plugin-section">
                  <div className="plugin-section-title">来源列表</div>
                  <ul className="plugin-sources">
                    {detail.sources.map((source) => (
                      <li
                        key={`${source.sourceLabel}-${source.name}-${source.command ?? source.url ?? ""}`}
                      >
                        <div className="plugin-source-top">
                          <strong>{source.sourceLabel}</strong>
                          <span className={`plugin-badge${source.active ? " active" : ""}`}>
                            {source.active ? "Active" : `Shadowed by ${source.shadowedBy}`}
                          </span>
                        </div>
                        <div className="plugin-source-body">
                          {source.transport === "stdio"
                            ? [source.command, ...(source.args ?? [])].filter(Boolean).join(" ") ||
                              "--"
                            : source.url || "--"}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {detail.item.error && (
                  <div className="plugin-section">
                    <div className="plugin-section-title">错误信息</div>
                    <pre className="plugin-preview">{detail.item.error}</pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
