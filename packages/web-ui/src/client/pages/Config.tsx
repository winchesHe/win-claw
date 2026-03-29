import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api.js";

interface AppConfig {
  llm: { provider: string; model: string; apiKey: string; baseUrl: string | null };
  embedding: { provider: string; model: string };
  telegram: { botToken: string };
  approval: { timeout: number; defaultAction: "reject" | "approve" };
  storage: { dbPath: string };
  logging: { level: "debug" | "info" | "warn" | "error" };
}

interface EnvVar {
  key: string;
  maskedValue: string;
  isSet: boolean;
  inExample: boolean;
}

const ENV_REF_PATTERN = /\$\{[^}]+\}/;

function isEnvRef(value: unknown): boolean {
  return typeof value === "string" && ENV_REF_PATTERN.test(value);
}

/** Flatten AppConfig into label/value pairs for rendering */
function flattenConfig(config: AppConfig) {
  return [
    { key: "llm.provider", label: "LLM Provider", value: config.llm.provider, section: "llm" },
    { key: "llm.model", label: "LLM 模型", value: config.llm.model, section: "llm" },
    { key: "llm.apiKey", label: "LLM API Key", value: config.llm.apiKey, section: "llm" },
    { key: "llm.baseUrl", label: "LLM Base URL", value: config.llm.baseUrl ?? "", section: "llm" },
    {
      key: "embedding.provider",
      label: "Embedding Provider",
      value: config.embedding.provider,
      section: "embedding",
    },
    {
      key: "embedding.model",
      label: "Embedding 模型",
      value: config.embedding.model,
      section: "embedding",
    },
    {
      key: "telegram.botToken",
      label: "Telegram Bot Token",
      value: config.telegram.botToken,
      section: "telegram",
    },
    {
      key: "approval.timeout",
      label: "审批超时 (秒)",
      value: config.approval.timeout,
      section: "approval",
    },
    {
      key: "approval.defaultAction",
      label: "默认审批动作",
      value: config.approval.defaultAction,
      section: "approval",
    },
    {
      key: "storage.dbPath",
      label: "数据库路径",
      value: config.storage.dbPath,
      section: "storage",
    },
    { key: "logging.level", label: "日志级别", value: config.logging.level, section: "logging" },
  ];
}
/** Editable fields and their input types */
const EDITABLE_FIELDS: Record<string, "text" | "number" | "select"> = {
  "llm.provider": "select",
  "llm.model": "text",
  "llm.baseUrl": "text",
  "embedding.provider": "text",
  "embedding.model": "text",
  "approval.timeout": "number",
  "approval.defaultAction": "select",
  "storage.dbPath": "text",
  "logging.level": "select",
};

const SELECT_OPTIONS: Record<string, string[]> = {
  "llm.provider": ["openai", "anthropic", "google", "openai-compatible"],
  "approval.defaultAction": ["reject", "approve"],
  "logging.level": ["debug", "info", "warn", "error"],
};

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

export default function Config() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Config form state
  const [configEdits, setConfigEdits] = useState<Record<string, string | number>>({});
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<{ field: string; error: string } | null>(null);
  const [configSuccess, setConfigSuccess] = useState(false);

  // Env form state
  const [envEdits, setEnvEdits] = useState<Record<string, string>>({});
  const [envSaving, setEnvSaving] = useState(false);
  const [envError, setEnvError] = useState<{ error: string; invalidKeys?: string[] } | null>(null);
  const [envSuccess, setEnvSuccess] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([apiFetch<AppConfig>("/config"), apiFetch<EnvVar[]>("/env")]).then(
      ([configData, envData]: [AppConfig, EnvVar[]]) => {
        setConfig(configData);
        setEnvVars(envData);
        setConfigEdits({});
        setEnvEdits({});
        setLoading(false);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConfigChange = (key: string, value: string | number) => {
    setConfigEdits((prev) => ({ ...prev, [key]: value }));
    setConfigError(null);
    setConfigSuccess(false);
  };

  const handleConfigSubmit = () => {
    if (Object.keys(configEdits).length === 0) return;
    setConfigSaving(true);
    setConfigError(null);
    setConfigSuccess(false);

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(configEdits)) {
      setNestedValue(updates, key, key === "approval.timeout" ? Number(value) : value);
    }

    apiFetch("/config", { method: "PUT", body: JSON.stringify(updates) })
      .then(() => {
        setConfigSuccess(true);
        fetchData();
      })
      .catch((err: unknown) => {
        try {
          const msg = err instanceof Error ? err.message : String(err);
          setConfigError({ field: "", error: msg });
        } catch {
          setConfigError({ field: "", error: "保存失败" });
        }
      })
      .finally(() => setConfigSaving(false));
  };

  const handleEnvChange = (key: string, value: string) => {
    setEnvEdits((prev) => ({ ...prev, [key]: value }));
    setEnvError(null);
    setEnvSuccess(false);
  };

  const handleEnvSubmit = () => {
    const updates = Object.fromEntries(Object.entries(envEdits).filter(([, v]) => v !== undefined));
    if (Object.keys(updates).length === 0) return;
    setEnvSaving(true);
    setEnvError(null);
    setEnvSuccess(false);

    apiFetch("/env", { method: "PUT", body: JSON.stringify(updates) })
      .then(() => {
        setEnvSuccess(true);
        fetchData();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setEnvError({ error: msg });
      })
      .finally(() => setEnvSaving(false));
  };

  if (loading) {
    return <div className="config-status">加载中…</div>;
  }

  if (error && !config) {
    return <div className="config-status config-error">加载失败：{error}</div>;
  }

  const fields = config ? flattenConfig(config) : [];

  return (
    <div className="config-page">
      {/* Config Section */}
      <div className="config-section">
        <h3 className="config-section-title">配置文件 (config.yaml)</h3>
        <div className="config-form">
          {fields.map((field) => {
            const readonly = isEnvRef(field.value);
            const editable = !readonly && field.key in EDITABLE_FIELDS;
            const fieldType = EDITABLE_FIELDS[field.key];
            const currentValue = field.key in configEdits ? configEdits[field.key] : field.value;

            return (
              <div className="config-form-row" key={field.key}>
                <label className="config-form-label">{field.label}</label>
                <div className="config-form-input-wrap">
                  {readonly ? (
                    <input
                      className="config-form-input config-form-input-readonly"
                      type="text"
                      value={String(field.value)}
                      disabled
                    />
                  ) : editable && fieldType === "select" ? (
                    <select
                      className="config-form-select"
                      value={String(currentValue)}
                      onChange={(e) => handleConfigChange(field.key, e.target.value)}
                    >
                      {(SELECT_OPTIONS[field.key] ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : editable && fieldType === "number" ? (
                    <input
                      className="config-form-input"
                      type="number"
                      min={1}
                      value={currentValue}
                      onChange={(e) => handleConfigChange(field.key, e.target.value)}
                    />
                  ) : editable ? (
                    <input
                      className="config-form-input"
                      type="text"
                      value={String(currentValue)}
                      onChange={(e) => handleConfigChange(field.key, e.target.value)}
                    />
                  ) : (
                    <input
                      className="config-form-input config-form-input-readonly"
                      type="text"
                      value={String(field.value)}
                      disabled
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {configError && (
          <div className="config-form-error">
            {configError.field ? `${configError.field}: ` : ""}
            {configError.error}
          </div>
        )}
        {configSuccess && <div className="config-form-success">配置已保存</div>}

        <button
          className="config-submit-btn"
          onClick={handleConfigSubmit}
          disabled={configSaving || Object.keys(configEdits).length === 0}
        >
          {configSaving ? "保存中…" : "保存配置"}
        </button>
      </div>

      {/* Env Section */}
      <div className="config-section">
        <h3 className="config-section-title">环境变量 (.env)</h3>
        <div className="config-form">
          {envVars.map((envVar) => (
            <div className="config-form-row" key={envVar.key}>
              <label className="config-form-label">
                {envVar.key}
                {!envVar.isSet && <span className="config-env-missing">未设置</span>}
              </label>
              <div className="config-form-input-wrap">
                <span className="config-env-masked">
                  {envVar.isSet ? envVar.maskedValue : "——"}
                </span>
                <input
                  className="config-form-input config-env-input"
                  type="password"
                  placeholder="输入新值…"
                  value={envEdits[envVar.key] ?? ""}
                  onChange={(e) => handleEnvChange(envVar.key, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        {envError && (
          <div className="config-form-error">
            {envError.error}
            {envError.invalidKeys && envError.invalidKeys.length > 0 && (
              <span>（未知键名：{envError.invalidKeys.join(", ")}）</span>
            )}
          </div>
        )}
        {envSuccess && <div className="config-form-success">环境变量已保存</div>}

        <button
          className="config-submit-btn"
          onClick={handleEnvSubmit}
          disabled={envSaving || Object.keys(envEdits).length === 0}
        >
          {envSaving ? "保存中…" : "保存环境变量"}
        </button>
      </div>
    </div>
  );
}
