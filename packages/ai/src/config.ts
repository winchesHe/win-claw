import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ConfigError } from "./errors.js";
import type { LLMConfig } from "./types.js";

/**
 * ConfigLoader — 配置加载器
 *
 * 从 YAML 文件和环境变量加载 LLM 配置。
 */
export class ConfigLoader {
  /**
   * 从 YAML 文件加载配置，提取 `llm` 配置段。
   */
  static fromYAML(filePath: string): LLMConfig {
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

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("llm" in parsed) ||
      parsed.llm === null ||
      typeof parsed.llm !== "object"
    ) {
      throw new ConfigError("Missing 'llm' section in config file");
    }

    const llm = parsed.llm as Record<string, unknown>;

    const config: Partial<LLMConfig> = {
      provider: typeof llm.provider === "string"
        ? ConfigLoader.resolveEnvVars(llm.provider)
        : undefined,
      model: typeof llm.model === "string"
        ? ConfigLoader.resolveEnvVars(llm.model)
        : undefined,
      apiKey: typeof llm.apiKey === "string"
        ? ConfigLoader.resolveEnvVars(llm.apiKey)
        : undefined,
      baseUrl: typeof llm.baseUrl === "string"
        ? ConfigLoader.resolveEnvVars(llm.baseUrl)
        : undefined,
    };

    return ConfigLoader.applyEnvOverrides(config);
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
   * - AGENT_LLM_PROVIDER → provider
   * - AGENT_LLM_MODEL → model
   * - AGENT_API_KEY → apiKey
   */
  static applyEnvOverrides(config: Partial<LLMConfig>): LLMConfig {
    const result: Partial<LLMConfig> = { ...config };

    if (process.env.AGENT_LLM_PROVIDER) {
      result.provider = process.env.AGENT_LLM_PROVIDER;
    }
    if (process.env.AGENT_LLM_MODEL) {
      result.model = process.env.AGENT_LLM_MODEL;
    }
    if (process.env.AGENT_API_KEY) {
      result.apiKey = process.env.AGENT_API_KEY;
    }

    ConfigLoader.validate(result);
    return result;
  }

  /**
   * 验证必需配置项（provider、model、apiKey）是否存在。
   * 缺失时抛出 ConfigError，包含缺失字段名称。
   */
  static validate(config: Partial<LLMConfig>): asserts config is LLMConfig {
    const required = ["provider", "model", "apiKey"] as const;
    for (const field of required) {
      if (!config[field]) {
        throw new ConfigError(
          `Missing required config field: ${field}`,
          field,
        );
      }
    }
  }
}
