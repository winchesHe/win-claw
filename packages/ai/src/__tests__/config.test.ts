import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigLoader } from "../config.js";
import { ConfigError } from "../errors.js";

describe("ConfigLoader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    // Clean up env vars
    delete process.env.AGENT_LLM_PROVIDER;
    delete process.env.AGENT_LLM_MODEL;
    delete process.env.AGENT_API_KEY;
  });

  describe("resolveEnvVars", () => {
    it("should replace ${VAR} with env var value", () => {
      process.env.MY_KEY = "secret-123";
      expect(ConfigLoader.resolveEnvVars("${MY_KEY}")).toBe("secret-123");
      delete process.env.MY_KEY;
    });

    it("should keep ${VAR} when env var is not set", () => {
      delete process.env.NONEXISTENT_VAR;
      expect(ConfigLoader.resolveEnvVars("${NONEXISTENT_VAR}")).toBe(
        "${NONEXISTENT_VAR}",
      );
    });

    it("should replace multiple env var references", () => {
      process.env.HOST = "localhost";
      process.env.PORT = "8080";
      expect(ConfigLoader.resolveEnvVars("${HOST}:${PORT}")).toBe(
        "localhost:8080",
      );
      delete process.env.HOST;
      delete process.env.PORT;
    });

    it("should return string as-is when no env var pattern", () => {
      expect(ConfigLoader.resolveEnvVars("plain-text")).toBe("plain-text");
    });

    it("should handle empty env var value", () => {
      process.env.EMPTY_VAR = "";
      expect(ConfigLoader.resolveEnvVars("${EMPTY_VAR}")).toBe("");
      delete process.env.EMPTY_VAR;
    });
  });

  describe("validate", () => {
    it("should pass for complete config", () => {
      const config = { provider: "openai", model: "gpt-4o", apiKey: "key" };
      expect(() => ConfigLoader.validate(config)).not.toThrow();
    });

    it("should throw ConfigError when provider is missing", () => {
      const config = { model: "gpt-4o", apiKey: "key" };
      expect(() => ConfigLoader.validate(config)).toThrow(ConfigError);
      expect(() => ConfigLoader.validate(config)).toThrow(/provider/);
    });

    it("should throw ConfigError when model is missing", () => {
      const config = { provider: "openai", apiKey: "key" };
      expect(() => ConfigLoader.validate(config)).toThrow(ConfigError);
      expect(() => ConfigLoader.validate(config)).toThrow(/model/);
    });

    it("should throw ConfigError when apiKey is missing", () => {
      const config = { provider: "openai", model: "gpt-4o" };
      expect(() => ConfigLoader.validate(config)).toThrow(ConfigError);
      expect(() => ConfigLoader.validate(config)).toThrow(/apiKey/);
    });

    it("should include field name in ConfigError", () => {
      try {
        ConfigLoader.validate({ provider: "openai" });
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).field).toBe("model");
      }
    });
  });

  describe("applyEnvOverrides", () => {
    it("should override provider from AGENT_LLM_PROVIDER", () => {
      process.env.AGENT_LLM_PROVIDER = "anthropic";
      const result = ConfigLoader.applyEnvOverrides({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "key",
      });
      expect(result.provider).toBe("anthropic");
    });

    it("should override model from AGENT_LLM_MODEL", () => {
      process.env.AGENT_LLM_MODEL = "claude-3";
      const result = ConfigLoader.applyEnvOverrides({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "key",
      });
      expect(result.model).toBe("claude-3");
    });

    it("should override apiKey from AGENT_API_KEY", () => {
      process.env.AGENT_API_KEY = "env-key";
      const result = ConfigLoader.applyEnvOverrides({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "file-key",
      });
      expect(result.apiKey).toBe("env-key");
    });

    it("should not override when env vars are not set", () => {
      const result = ConfigLoader.applyEnvOverrides({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "key",
      });
      expect(result.provider).toBe("openai");
      expect(result.model).toBe("gpt-4o");
      expect(result.apiKey).toBe("key");
    });

    it("should preserve baseUrl from config", () => {
      const result = ConfigLoader.applyEnvOverrides({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "key",
        baseUrl: "https://custom.api",
      });
      expect(result.baseUrl).toBe("https://custom.api");
    });
  });

  describe("fromYAML", () => {
    it("should parse a valid YAML config file", () => {
      const yaml = `llm:\n  provider: openai\n  model: gpt-4o\n  apiKey: my-key\n`;
      const filePath = join(tempDir, "config.yaml");
      writeFileSync(filePath, yaml);

      const config = ConfigLoader.fromYAML(filePath);
      expect(config.provider).toBe("openai");
      expect(config.model).toBe("gpt-4o");
      expect(config.apiKey).toBe("my-key");
    });

    it("should resolve env vars in YAML values", () => {
      process.env.AGENT_API_KEY = "resolved-key";
      const yaml = `llm:\n  provider: openai\n  model: gpt-4o\n  apiKey: \${AGENT_API_KEY}\n`;
      const filePath = join(tempDir, "config.yaml");
      writeFileSync(filePath, yaml);

      const config = ConfigLoader.fromYAML(filePath);
      expect(config.apiKey).toBe("resolved-key");
    });

    it("should handle baseUrl field", () => {
      const yaml = `llm:\n  provider: openai-compatible\n  model: deepseek\n  apiKey: key\n  baseUrl: https://api.deepseek.com\n`;
      const filePath = join(tempDir, "config.yaml");
      writeFileSync(filePath, yaml);

      const config = ConfigLoader.fromYAML(filePath);
      expect(config.baseUrl).toBe("https://api.deepseek.com");
    });

    it("should throw ConfigError for missing file", () => {
      expect(() => ConfigLoader.fromYAML("/nonexistent/path.yaml")).toThrow(
        ConfigError,
      );
    });

    it("should throw ConfigError for invalid YAML", () => {
      const filePath = join(tempDir, "bad.yaml");
      writeFileSync(filePath, "{{invalid yaml");

      expect(() => ConfigLoader.fromYAML(filePath)).toThrow(ConfigError);
    });

    it("should throw ConfigError when llm section is missing", () => {
      const yaml = `other:\n  key: value\n`;
      const filePath = join(tempDir, "no-llm.yaml");
      writeFileSync(filePath, yaml);

      expect(() => ConfigLoader.fromYAML(filePath)).toThrow(ConfigError);
      expect(() => ConfigLoader.fromYAML(filePath)).toThrow(/llm/);
    });

    it("should throw ConfigError when required fields are missing in YAML", () => {
      const yaml = `llm:\n  provider: openai\n`;
      const filePath = join(tempDir, "partial.yaml");
      writeFileSync(filePath, yaml);

      expect(() => ConfigLoader.fromYAML(filePath)).toThrow(ConfigError);
    });

    it("should apply env overrides after YAML parsing", () => {
      process.env.AGENT_LLM_MODEL = "override-model";
      const yaml = `llm:\n  provider: openai\n  model: gpt-4o\n  apiKey: key\n`;
      const filePath = join(tempDir, "config.yaml");
      writeFileSync(filePath, yaml);

      const config = ConfigLoader.fromYAML(filePath);
      expect(config.model).toBe("override-model");
    });

    it("should handle null baseUrl in YAML", () => {
      const yaml = `llm:\n  provider: openai\n  model: gpt-4o\n  apiKey: key\n  baseUrl: null\n`;
      const filePath = join(tempDir, "config.yaml");
      writeFileSync(filePath, yaml);

      const config = ConfigLoader.fromYAML(filePath);
      expect(config.baseUrl).toBeUndefined();
    });
  });
});
