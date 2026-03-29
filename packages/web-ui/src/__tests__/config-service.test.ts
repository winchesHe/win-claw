import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigService } from "../server/services/config-service.js";
import { ConfigValidationError } from "../server/errors.js";

const SAMPLE_YAML = `llm:
  provider: openai
  model: gpt-4o
  apiKey: \${AGENT_API_KEY}
  baseUrl: null
embedding:
  provider: local
  model: Xenova/all-MiniLM-L6-v2
telegram:
  botToken: \${AGENT_TELEGRAM_TOKEN}
approval:
  timeout: 300
  defaultAction: reject
storage:
  dbPath: ./data/agent.db
logging:
  level: info
`;

describe("ConfigService", () => {
  let tempDir: string;
  let configPath: string;
  let service: ConfigService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "config-service-test-"));
    configPath = join(tempDir, "config.yaml");
    writeFileSync(configPath, SAMPLE_YAML);
    service = new ConfigService(configPath);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getConfig", () => {
    it("应读取 config.yaml 并返回完整配置", () => {
      const config = service.getConfig();
      expect(config.llm.provider).toBe("openai");
      expect(config.llm.model).toBe("gpt-4o");
      expect(config.approval.timeout).toBe(300);
      expect(config.logging.level).toBe("info");
    });

    it("应保留 ${...} 引用不解析", () => {
      const config = service.getConfig();
      expect(config.llm.apiKey).toBe("${AGENT_API_KEY}");
      expect(config.telegram.botToken).toBe("${AGENT_TELEGRAM_TOKEN}");
    });

    it("应在文件不存在时抛出错误", () => {
      const badService = new ConfigService("/nonexistent/config.yaml");
      expect(() => badService.getConfig()).toThrow();
    });
  });

  describe("updateConfig", () => {
    it("应更新合法的配置值", () => {
      service.updateConfig({
        llm: { provider: "anthropic", model: "gpt-4o", apiKey: "${AGENT_API_KEY}", baseUrl: null },
      });
      const config = service.getConfig();
      expect(config.llm.provider).toBe("anthropic");
    });

    it("应保护 ${...} 引用字段不被覆盖", () => {
      service.updateConfig({
        llm: { provider: "openai", model: "gpt-4o", apiKey: "plain-key", baseUrl: null },
      });
      const config = service.getConfig();
      expect(config.llm.apiKey).toBe("${AGENT_API_KEY}");
    });

    it("应在 provider 非法时抛出 ConfigValidationError", () => {
      expect(() =>
        service.updateConfig({
          llm: { provider: "invalid-provider", model: "m", apiKey: "k", baseUrl: null },
        }),
      ).toThrow(ConfigValidationError);
    });

    it("应在 timeout 非正整数时抛出 ConfigValidationError", () => {
      expect(() =>
        service.updateConfig({ approval: { timeout: -1, defaultAction: "reject" } }),
      ).toThrow(ConfigValidationError);

      expect(() =>
        service.updateConfig({ approval: { timeout: 0, defaultAction: "reject" } }),
      ).toThrow(ConfigValidationError);

      expect(() =>
        service.updateConfig({ approval: { timeout: 3.5, defaultAction: "reject" } }),
      ).toThrow(ConfigValidationError);
    });

    it("应在 logging.level 非法时抛出 ConfigValidationError", () => {
      expect(() => service.updateConfig({ logging: { level: "verbose" as "debug" } })).toThrow(
        ConfigValidationError,
      );
    });

    it("应在 defaultAction 非法时抛出 ConfigValidationError", () => {
      expect(() =>
        service.updateConfig({ approval: { timeout: 300, defaultAction: "ignore" as "reject" } }),
      ).toThrow(ConfigValidationError);
    });

    it("应通过原子写入（临时文件 + rename）更新文件", () => {
      service.updateConfig({ approval: { timeout: 600, defaultAction: "approve" } });
      const raw = readFileSync(configPath, "utf-8");
      expect(raw).toContain("timeout: 600");
      expect(raw).toContain("defaultAction: approve");
    });

    it("验证失败时不应修改文件", () => {
      const originalContent = readFileSync(configPath, "utf-8");
      try {
        service.updateConfig({ llm: { provider: "bad", model: "m", apiKey: "k", baseUrl: null } });
      } catch {
        // expected
      }
      const afterContent = readFileSync(configPath, "utf-8");
      expect(afterContent).toBe(originalContent);
    });

    it("应支持部分更新（仅更新 logging.level）", () => {
      service.updateConfig({ logging: { level: "debug" } });
      const config = service.getConfig();
      expect(config.logging.level).toBe("debug");
      expect(config.llm.provider).toBe("openai");
      expect(config.approval.timeout).toBe(300);
    });
  });
});
