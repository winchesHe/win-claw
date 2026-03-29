import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import type { AppConfig } from "../types.js";
import { ConfigValidationError } from "../errors.js";

const ENV_REF_PATTERN = /\$\{[^}]+\}/;

const VALID_PROVIDERS = ["openai", "anthropic", "google", "openai-compatible"] as const;
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const VALID_DEFAULT_ACTIONS = ["reject", "approve"] as const;

export class ConfigService {
  private readonly configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  getConfig(): AppConfig {
    const raw = readFileSync(this.configPath, "utf-8");
    return parse(raw) as AppConfig;
  }

  updateConfig(updates: Partial<AppConfig>): void {
    this.validateUpdates(updates);

    const original = this.getConfig();
    const merged = this.mergeWithProtection(original, updates);
    const yamlStr = stringify(merged);

    const dir = dirname(this.configPath);
    const tmpPath = join(dir, `.config.yaml.tmp.${Date.now()}`);

    writeFileSync(tmpPath, yamlStr, "utf-8");
    renameSync(tmpPath, this.configPath);
  }

  private validateUpdates(updates: Partial<AppConfig>): void {
    if (updates.llm?.provider !== undefined) {
      if (!(VALID_PROVIDERS as readonly string[]).includes(updates.llm.provider)) {
        throw new ConfigValidationError(
          "llm.provider",
          `must be one of: ${VALID_PROVIDERS.join(", ")}`,
        );
      }
    }

    if (updates.approval?.timeout !== undefined) {
      if (!Number.isInteger(updates.approval.timeout) || updates.approval.timeout <= 0) {
        throw new ConfigValidationError("approval.timeout", "must be a positive integer");
      }
    }

    if (updates.approval?.defaultAction !== undefined) {
      if (!(VALID_DEFAULT_ACTIONS as readonly string[]).includes(updates.approval.defaultAction)) {
        throw new ConfigValidationError(
          "approval.defaultAction",
          `must be one of: ${VALID_DEFAULT_ACTIONS.join(", ")}`,
        );
      }
    }

    if (updates.logging?.level !== undefined) {
      if (!(VALID_LOG_LEVELS as readonly string[]).includes(updates.logging.level)) {
        throw new ConfigValidationError(
          "logging.level",
          `must be one of: ${VALID_LOG_LEVELS.join(", ")}`,
        );
      }
    }
  }

  private mergeWithProtection(original: AppConfig, updates: Partial<AppConfig>): AppConfig {
    const result = structuredClone(original);

    for (const [sectionKey, sectionUpdates] of Object.entries(updates)) {
      if (sectionUpdates === undefined || sectionUpdates === null) continue;
      const origSection = (result as unknown as Record<string, Record<string, unknown>>)[
        sectionKey
      ];
      if (!origSection || typeof origSection !== "object") continue;

      for (const [fieldKey, newValue] of Object.entries(
        sectionUpdates as Record<string, unknown>,
      )) {
        const origValue = origSection[fieldKey];
        if (typeof origValue === "string" && ENV_REF_PATTERN.test(origValue)) {
          continue;
        }
        origSection[fieldKey] = newValue;
      }
    }

    return result;
  }
}
