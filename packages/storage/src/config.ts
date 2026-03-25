import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ConfigError } from "./errors.js";
import type { StorageConfig } from "./types.js";

const DEFAULT_DB_PATH = "./data/agent.db";

/**
 * StorageConfigLoader — 配置加载器
 *
 * 从 YAML 文件和环境变量加载 Storage 配置。
 */
export class StorageConfigLoader {
  /**
   * 从 YAML 文件加载配置，提取 `storage` 和 `embedding` 配置段。
   */
  static fromYAML(filePath: string): StorageConfig {
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf-8");
    } catch {
      throw new ConfigError(
        `Failed to read config file: ${filePath}`,
        "filePath",
      );
    }

    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch (err) {
      throw new ConfigError(
        `Failed to parse YAML: ${(err as Error).message}`,
      );
    }

    if (parsed === null || typeof parsed !== "object") {
      throw new ConfigError("Invalid config file: expected an object");
    }

    const doc = parsed as Record<string, unknown>;

    // --- storage.dbPath ---
    const storageSection =
      doc.storage !== null && typeof doc.storage === "object"
        ? (doc.storage as Record<string, unknown>)
        : {};

    const rawDbPath =
      typeof storageSection.dbPath === "string"
        ? StorageConfigLoader.resolveEnvVars(storageSection.dbPath)
        : undefined;

    // --- embedding ---
    const embeddingSection =
      doc.embedding !== null && typeof doc.embedding === "object"
        ? (doc.embedding as Record<string, unknown>)
        : {};

    const config: Partial<StorageConfig> = {
      dbPath: rawDbPath,
      embedding: {
        provider:
          typeof embeddingSection.provider === "string"
            ? StorageConfigLoader.resolveEnvVars(embeddingSection.provider)
            : "",
        model:
          typeof embeddingSection.model === "string"
            ? StorageConfigLoader.resolveEnvVars(embeddingSection.model)
            : "",
        apiKey:
          typeof embeddingSection.apiKey === "string"
            ? StorageConfigLoader.resolveEnvVars(embeddingSection.apiKey)
            : "",
        baseUrl:
          typeof embeddingSection.baseUrl === "string"
            ? StorageConfigLoader.resolveEnvVars(embeddingSection.baseUrl)
            : undefined,
      },
    };

    return StorageConfigLoader.applyEnvOverrides(config);
  }

  /**
   * 替换字符串中的 `${ENV_VAR}` 引用为实际环境变量值。
   * 未设置的环境变量保留原始 `${ENV_VAR}` 文本。
   */
  static resolveEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      const envValue = process.env[varName];
      return envValue !== undefined ? envValue : _match;
    });
  }

  /**
   * 使用环境变量覆盖配置值，然后验证必需字段。
   *
   * 环境变量映射：
   * - AGENT_STORAGE_DB_PATH → dbPath
   * - AGENT_API_KEY → embedding.apiKey
   */
  static applyEnvOverrides(config: Partial<StorageConfig>): StorageConfig {
    const result: Partial<StorageConfig> = {
      ...config,
      embedding: config.embedding ? { ...config.embedding } : undefined,
    };

    // dbPath 覆盖，缺失时使用默认值
    if (process.env.AGENT_STORAGE_DB_PATH) {
      result.dbPath = process.env.AGENT_STORAGE_DB_PATH;
    }
    if (!result.dbPath) {
      result.dbPath = DEFAULT_DB_PATH;
    }

    // embedding.apiKey 覆盖
    if (process.env.AGENT_API_KEY && result.embedding) {
      result.embedding = { ...result.embedding, apiKey: process.env.AGENT_API_KEY };
    }

    StorageConfigLoader.validate(result);
    return result;
  }

  /**
   * 验证必需配置项是否存在。
   */
  static validate(
    config: Partial<StorageConfig>,
  ): asserts config is StorageConfig {
    if (!config.dbPath) {
      throw new ConfigError("Missing required config field: dbPath", "dbPath");
    }
    if (!config.embedding) {
      throw new ConfigError(
        "Missing 'embedding' section in config file",
        "embedding",
      );
    }
    if (!config.embedding.provider) {
      throw new ConfigError(
        "Missing required config field: embedding.provider",
        "embedding.provider",
      );
    }
    if (!config.embedding.model) {
      throw new ConfigError(
        "Missing required config field: embedding.model",
        "embedding.model",
      );
    }
    if (config.embedding.provider !== "local" && !config.embedding.apiKey) {
      throw new ConfigError(
        "Missing required config field: embedding.apiKey",
        "embedding.apiKey",
      );
    }
  }
}
