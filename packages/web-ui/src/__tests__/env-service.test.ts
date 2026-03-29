import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EnvService } from "../server/services/env-service.js";
import { UnknownEnvKeyError } from "../server/errors.js";

const SAMPLE_ENV = `# LLM 配置
AGENT_API_KEY=sk-secret-key-123
AGENT_LLM_PROVIDER=openai
AGENT_LLM_MODEL=gpt-4o

# Telegram
AGENT_TELEGRAM_TOKEN=bot-token-abc

# Storage
AGENT_STORAGE_DB_PATH=./data/agent.db
`;

const SAMPLE_ENV_EXAMPLE = `AGENT_API_KEY=your_api_key_here
AGENT_LLM_PROVIDER=openai
AGENT_LLM_MODEL=gpt-4o
AGENT_LLM_BASE_URL=https://your-custom-endpoint/v1
AGENT_TELEGRAM_TOKEN=your_telegram_bot_token_here
AGENT_STORAGE_DB_PATH=./data/agent.db
`;

describe("EnvService", () => {
  let tempDir: string;
  let envPath: string;
  let envExamplePath: string;
  let service: EnvService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "env-service-test-"));
    envPath = join(tempDir, ".env");
    envExamplePath = join(tempDir, ".env.example");
    writeFileSync(envPath, SAMPLE_ENV);
    writeFileSync(envExamplePath, SAMPLE_ENV_EXAMPLE);
    service = new EnvService(envPath, envExamplePath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getEnvVars", () => {
    it("应读取 .env 并返回遮蔽后的值", () => {
      const vars = service.getEnvVars();
      const apiKey = vars.find((v) => v.key === "AGENT_API_KEY");
      expect(apiKey).toBeDefined();
      expect(apiKey!.maskedValue).toBe("••••••••");
      expect(apiKey!.isSet).toBe(true);
      expect(apiKey!.maskedValue).not.toContain("sk-secret-key-123");
    });

    it("应确保所有返回值中不包含明文", () => {
      const vars = service.getEnvVars();
      for (const v of vars) {
        expect(v.maskedValue === "••••••••" || v.maskedValue === "").toBe(true);
      }
    });

    it("应对照 .env.example 标注缺失变量", () => {
      const vars = service.getEnvVars();
      const baseUrl = vars.find((v) => v.key === "AGENT_LLM_BASE_URL");
      expect(baseUrl).toBeDefined();
      expect(baseUrl!.isSet).toBe(false);
      expect(baseUrl!.inExample).toBe(true);
      expect(baseUrl!.maskedValue).toBe("");
    });

    it("应标注 .env 中存在但 .env.example 中不存在的变量", () => {
      writeFileSync(envPath, "CUSTOM_VAR=hello\n");
      writeFileSync(envExamplePath, "OTHER_VAR=world\n");
      const s = new EnvService(envPath, envExamplePath);
      const vars = s.getEnvVars();
      const custom = vars.find((v) => v.key === "CUSTOM_VAR");
      expect(custom).toBeDefined();
      expect(custom!.isSet).toBe(true);
      expect(custom!.inExample).toBe(false);
    });

    it("应在 .env 不存在时返回空列表（不报错）", () => {
      const s = new EnvService(join(tempDir, "nonexistent.env"), envExamplePath);
      const vars = s.getEnvVars();
      // Should still return vars from .env.example with isSet: false
      expect(vars.length).toBeGreaterThan(0);
      for (const v of vars) {
        expect(v.isSet).toBe(false);
        expect(v.inExample).toBe(true);
      }
    });

    it("应在 .env 和 .env.example 都不存在时返回空列表", () => {
      const s = new EnvService(
        join(tempDir, "nonexistent.env"),
        join(tempDir, "nonexistent.env.example"),
      );
      const vars = s.getEnvVars();
      expect(vars).toEqual([]);
    });

    it("应在 .env.example 不存在时所有变量标记为 inExample: false", () => {
      const s = new EnvService(envPath, join(tempDir, "nonexistent.env.example"));
      const vars = s.getEnvVars();
      expect(vars.length).toBeGreaterThan(0);
      for (const v of vars) {
        expect(v.inExample).toBe(false);
      }
    });

    it("应对空值变量返回空字符串 maskedValue", () => {
      writeFileSync(envPath, "EMPTY_VAR=\n");
      writeFileSync(envExamplePath, "EMPTY_VAR=default\n");
      const s = new EnvService(envPath, envExamplePath);
      const vars = s.getEnvVars();
      const emptyVar = vars.find((v) => v.key === "EMPTY_VAR");
      expect(emptyVar).toBeDefined();
      expect(emptyVar!.maskedValue).toBe("");
      expect(emptyVar!.isSet).toBe(true);
    });
  });

  describe("updateEnvVars", () => {
    it("应更新已存在的键值", () => {
      service.updateEnvVars({ AGENT_LLM_MODEL: "gpt-5" });
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("AGENT_LLM_MODEL=gpt-5");
    });

    it("应拒绝未知键名并抛出 UnknownEnvKeyError", () => {
      expect(() => service.updateEnvVars({ UNKNOWN_KEY: "value" })).toThrow(UnknownEnvKeyError);
    });

    it("应在 UnknownEnvKeyError 中包含无效键名列表", () => {
      try {
        service.updateEnvVars({ BAD_KEY1: "a", BAD_KEY2: "b" });
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownEnvKeyError);
        expect((e as UnknownEnvKeyError).invalidKeys).toContain("BAD_KEY1");
        expect((e as UnknownEnvKeyError).invalidKeys).toContain("BAD_KEY2");
      }
    });

    it("应保留注释行和空行", () => {
      service.updateEnvVars({ AGENT_API_KEY: "new-key" });
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("# LLM 配置");
      expect(content).toContain("# Telegram");
      expect(content).toContain("# Storage");
      // Check blank lines are preserved
      const lines = content.split("\n");
      const blankLineIndices = lines
        .map((l, i) => (l.trim() === "" ? i : -1))
        .filter((i) => i !== -1);
      expect(blankLineIndices.length).toBeGreaterThan(0);
    });

    it("应支持空字符串值（KEY= 格式）", () => {
      service.updateEnvVars({ AGENT_LLM_MODEL: "" });
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("AGENT_LLM_MODEL=");
      // Ensure the line is exactly KEY= (not deleted)
      const lines = content.split("\n");
      const modelLine = lines.find((l) => l.startsWith("AGENT_LLM_MODEL="));
      expect(modelLine).toBe("AGENT_LLM_MODEL=");
    });

    it("应添加 .env.example 中存在但 .env 中不存在的键", () => {
      service.updateEnvVars({ AGENT_LLM_BASE_URL: "https://new-url.com/v1" });
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("AGENT_LLM_BASE_URL=https://new-url.com/v1");
    });

    it("应仅替换匹配键名的值部分", () => {
      service.updateEnvVars({ AGENT_API_KEY: "new-secret" });
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("AGENT_API_KEY=new-secret");
      // Other keys should remain unchanged
      expect(content).toContain("AGENT_LLM_PROVIDER=openai");
      expect(content).toContain("AGENT_LLM_MODEL=gpt-4o");
    });

    it("未知键名时不应修改文件", () => {
      const originalContent = readFileSync(envPath, "utf-8");
      try {
        service.updateEnvVars({ UNKNOWN: "val" });
      } catch {
        // expected
      }
      const afterContent = readFileSync(envPath, "utf-8");
      expect(afterContent).toBe(originalContent);
    });
  });
});
