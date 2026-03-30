import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

interface SkillSourceView {
  name: string;
  description: string;
  sourceLabel: string;
  scope: "project" | "global" | "yaml";
  ideType: "cursor" | "claude" | "codex" | "kiro" | "config-yaml";
  path?: string;
  contentMode: "inline" | "file";
  editable: boolean;
  active: boolean;
  shadowedBy?: string;
  issues: string[];
}

interface SkillListItemView {
  name: string;
  description: string;
  activeSource: SkillSourceView;
  sourceCount: number;
  shadowedCount: number;
}

interface SkillDetailView {
  item: SkillListItemView;
  sources: SkillSourceView[];
  preview?: string;
}

const EMPTY_FORM = { name: "", description: "", body: "" };

export default function Skills() {
  const [skills, setSkills] = useState<SkillListItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "project" | "global" | "yaml">("all");

  function loadSkills(preferredName?: string) {
    setLoading(true);
    setError(null);
    apiFetch<SkillListItemView[]>("/plugins/skills")
      .then((data) => {
        setSkills(data);
        if (data.length === 0) {
          setSelectedName(null);
          return;
        }
        const fallback = preferredName && data.some((skill) => skill.name === preferredName);
        setSelectedName(fallback ? preferredName : data[0].name);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    if (!selectedName) return;
    setDetailLoading(true);
    setDetailError(null);
    apiFetch<SkillDetailView>(`/plugins/skills/${selectedName}`)
      .then((data) => {
        setDetail(data);
        if (!editing) {
          setForm({
            name: data.item.name,
            description: data.item.description,
            body: data.preview ?? "",
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
      description: detail.item.description,
      body: detail.preview ?? "",
    });
    setFormError(null);
  }

  function handleSave() {
    setSaving(true);
    setFormError(null);
    const method = selectedName ? "PUT" : "POST";
    const path = selectedName ? `/plugins/skills/${selectedName}` : "/plugins/skills";

    apiFetch(path, {
      method,
      body: JSON.stringify(form),
    })
      .then(() => {
        setEditing(false);
        loadSkills(form.name);
      })
      .catch((err: unknown) => setFormError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!selectedName) return;
    setSaving(true);
    setFormError(null);
    apiFetch(`/plugins/skills/${selectedName}`, { method: "DELETE" })
      .then(() => {
        setEditing(false);
        setDetail(null);
        loadSkills();
      })
      .catch((err: unknown) => setFormError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  if (loading) {
    return <div className="plugin-status">加载 Skills 中…</div>;
  }

  if (error) {
    return <div className="plugin-status plugin-error">加载失败：{error}</div>;
  }

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase());
    const matchesScope = scopeFilter === "all" || skill.activeSource.scope === scopeFilter;
    return matchesSearch && matchesScope;
  });

  return (
    <div className="plugin-layout">
      <div className="plugin-list-panel">
        <div className="plugin-panel-header">
          <h3>Skills</h3>
          <button className="plugin-action-btn" onClick={handleCreate}>
            新建
          </button>
        </div>
        <div className="plugin-toolbar">
          <input
            className="plugin-search"
            placeholder="搜索 Skills"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
        {filteredSkills.length === 0 ? (
          <p className="plugin-empty">当前未发现可展示的 Skills</p>
        ) : (
          <ul className="plugin-list">
            {filteredSkills.map((skill) => (
              <li
                key={skill.name}
                className={`plugin-list-item${selectedName === skill.name ? " selected" : ""}`}
                onClick={() => {
                  setEditing(false);
                  setSelectedName(skill.name);
                }}
              >
                <div className="plugin-item-title-row">
                  <div className="plugin-item-title">{skill.name}</div>
                  {skill.shadowedCount > 0 && (
                    <span className="plugin-badge">{skill.shadowedCount} shadowed</span>
                  )}
                </div>
                <div className="plugin-item-desc">{skill.description || "无描述"}</div>
                <div className="plugin-item-meta">{skill.activeSource.sourceLabel}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="plugin-detail-panel">
        {editing ? (
          <div className="plugin-detail plugin-form-wrap">
            <div className="plugin-panel-header">
              <h3>{selectedName ? `编辑 ${selectedName}` : "新建 Skill"}</h3>
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
                <span>描述</span>
                <input
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>
              <label>
                <span>内容</span>
                <textarea
                  rows={14}
                  value={form.body}
                  onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                />
              </label>
              {formError && <div className="plugin-form-error">{formError}</div>}
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
            {!selectedName && <p className="plugin-empty">请选择一个 Skill 查看详情</p>}
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
                    <div>描述</div>
                    <div>{detail.item.description || "无描述"}</div>
                    <div>来源</div>
                    <div>{detail.item.activeSource.sourceLabel}</div>
                    <div>模式</div>
                    <div>{detail.item.activeSource.contentMode}</div>
                    <div>路径</div>
                    <div>{detail.item.activeSource.path ?? "inline"}</div>
                  </div>
                </div>

                <div className="plugin-section">
                  <div className="plugin-section-title">来源列表</div>
                  <ul className="plugin-sources">
                    {detail.sources.map((source) => (
                      <li key={`${source.sourceLabel}-${source.path ?? source.name}`}>
                        <div className="plugin-source-top">
                          <strong>{source.sourceLabel}</strong>
                          <span className={`plugin-badge${source.active ? " active" : ""}`}>
                            {source.active ? "Active" : `Shadowed by ${source.shadowedBy}`}
                          </span>
                        </div>
                        <div className="plugin-source-body">{source.path ?? "inline content"}</div>
                      </li>
                    ))}
                  </ul>
                </div>

                {detail.preview && (
                  <div className="plugin-section">
                    <div className="plugin-section-title">内容预览</div>
                    <pre className="plugin-preview">{detail.preview}</pre>
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
