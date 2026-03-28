import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { TuiConfig } from "./types.js";

export class TuiConfigError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "TuiConfigError";
  }
}

/** 替换 ${ENV_VAR} 引用为实际环境变量值 */
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
    const envValue = process.env[varName];
    return envValue !== undefined ? envValue : _match;
  });
}

/**
 * 从 config.yaml 加载 TUI 配置，支持环境变量覆盖。
 * 缺少必填字段时抛出 TuiConfigError。
 */
export function loadConfig(configPath?: string): TuiConfig {
  const filePath = configPath ?? resolve(process.cwd(), "config.yaml");

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new TuiConfigError(`Failed to read config file: ${filePath}`, "filePath");
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new TuiConfigError(`Failed to parse YAML: ${(err as Error).message}`);
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new TuiConfigError("Invalid config file: expected an object");
  }

  const doc = parsed as Record<string, unknown>;

  // --- llm ---
  const llmSection =
    doc.llm !== null && typeof doc.llm === "object" ? (doc.llm as Record<string, unknown>) : {};

  const llmProvider =
    typeof llmSection.provider === "string" ? resolveEnvVars(llmSection.provider) : "";
  const llmModel =
    typeof llmSection.model === "string" ? resolveEnvVars(llmSection.model) : "gpt-4o";
  const llmApiKey = typeof llmSection.apiKey === "string" ? resolveEnvVars(llmSection.apiKey) : "";
  const llmBaseUrl =
    typeof llmSection.baseUrl === "string" && llmSection.baseUrl !== "null"
      ? resolveEnvVars(llmSection.baseUrl)
      : undefined;

  // --- embedding ---
  const embeddingSection =
    doc.embedding !== null && typeof doc.embedding === "object"
      ? (doc.embedding as Record<string, unknown>)
      : {};

  const embeddingProvider =
    typeof embeddingSection.provider === "string"
      ? resolveEnvVars(embeddingSection.provider)
      : "openai";
  const embeddingModel =
    typeof embeddingSection.model === "string"
      ? resolveEnvVars(embeddingSection.model)
      : "text-embedding-3-small";

  // --- approval ---
  const approvalSection =
    doc.approval !== null && typeof doc.approval === "object"
      ? (doc.approval as Record<string, unknown>)
      : {};

  const approvalTimeout =
    typeof approvalSection.timeout === "number" ? approvalSection.timeout : 300;
  const approvalDefaultAction = approvalSection.defaultAction === "approve" ? "approve" : "reject";

  // --- storage ---
  const storageSection =
    doc.storage !== null && typeof doc.storage === "object"
      ? (doc.storage as Record<string, unknown>)
      : {};

  const dbPath =
    typeof storageSection.dbPath === "string"
      ? resolveEnvVars(storageSection.dbPath)
      : "./data/agent.db";

  // --- logging ---
  const loggingSection =
    doc.logging !== null && typeof doc.logging === "object"
      ? (doc.logging as Record<string, unknown>)
      : {};

  const validLevels = ["debug", "info", "warn", "error"] as const;
  const loggingLevel =
    typeof loggingSection.level === "string" &&
    validLevels.includes(loggingSection.level as (typeof validLevels)[number])
      ? (loggingSection.level as TuiConfig["logging"]["level"])
      : "info";

  // --- 环境变量覆盖 ---
  const finalApiKey = process.env.AGENT_API_KEY ?? llmApiKey;
  const finalProvider = process.env.AGENT_LLM_PROVIDER ?? llmProvider;
  const finalModel = process.env.AGENT_LLM_MODEL ?? llmModel;
  const finalBaseUrl = process.env.AGENT_LLM_BASE_URL ?? llmBaseUrl;
  const finalDbPath = process.env.AGENT_STORAGE_DB_PATH ?? dbPath;

  // --- 校验必填字段 ---
  if (!finalProvider) {
    throw new TuiConfigError(
      "Missing required config field: llm.provider (set AGENT_LLM_PROVIDER or config.yaml llm.provider)",
      "llm.provider",
    );
  }
  if (!finalApiKey || finalApiKey.startsWith("${")) {
    throw new TuiConfigError(
      "Missing required config field: llm.apiKey (set AGENT_API_KEY or config.yaml llm.apiKey)",
      "llm.apiKey",
    );
  }

  return {
    llm: {
      provider: finalProvider,
      model: finalModel,
      apiKey: finalApiKey,
      baseUrl: finalBaseUrl,
    },
    embedding: {
      provider: embeddingProvider,
      model: embeddingModel,
    },
    approval: {
      timeout: approvalTimeout,
      defaultAction: approvalDefaultAction,
    },
    storage: {
      dbPath: finalDbPath,
    },
    logging: {
      level: loggingLevel,
    },
  };
}
