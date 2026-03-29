import { describe, it, expect, vi } from "vitest";
import type { ConfigService } from "../server/services/config-service.js";
import type { EnvService } from "../server/services/env-service.js";
import type { AppConfig } from "../server/types.js";
import type { EnvVar } from "../server/types.js";
import { ConfigValidationError, UnknownEnvKeyError } from "../server/errors.js";
import { createConfigRoutes } from "../server/routes/config.js";

const sampleConfig: AppConfig = {
  llm: {
    provider: "openai",
    model: "gpt-4",
    apiKey: "${AGENT_API_KEY}",
    baseUrl: null,
  },
  embedding: { provider: "local", model: "all-MiniLM-L6-v2" },
  telegram: { botToken: "${AGENT_TELEGRAM_TOKEN}" },
  approval: { timeout: 60, defaultAction: "reject" },
  storage: { dbPath: "./data/agent.db" },
  logging: { level: "info" },
};

function makeMockConfigService(overrides: Partial<ConfigService> = {}): ConfigService {
  return {
    getConfig: vi.fn().mockReturnValue(sampleConfig),
    updateConfig: vi.fn(),
    ...overrides,
  } as unknown as ConfigService;
}

function makeMockEnvService(overrides: Partial<EnvService> = {}): EnvService {
  return {
    getEnvVars: vi.fn().mockReturnValue([]),
    updateEnvVars: vi.fn(),
    ...overrides,
  } as unknown as EnvService;
}

describe("config 路由", () => {
  it("GET /api/config 返回配置", async () => {
    const configService = makeMockConfigService();
    const envService = makeMockEnvService();
    const app = createConfigRoutes(configService, envService);

    const res = await app.request("/api/config");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.llm.provider).toBe("openai");
    expect(body.llm.apiKey).toBe("${AGENT_API_KEY}");
    expect(configService.getConfig).toHaveBeenCalled();
  });

  it("PUT /api/config 合法数据返回 200", async () => {
    const configService = makeMockConfigService();
    const envService = makeMockEnvService();
    const app = createConfigRoutes(configService, envService);

    const res = await app.request("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logging: { level: "debug" } }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(configService.updateConfig).toHaveBeenCalledWith({ logging: { level: "debug" } });
  });

  it("PUT /api/config 非法数据返回 400", async () => {
    const configService = makeMockConfigService({
      updateConfig: vi.fn().mockImplementation(() => {
        throw new ConfigValidationError(
          "llm.provider",
          "must be one of: openai, anthropic, google, openai-compatible",
        );
      }),
    });
    const envService = makeMockEnvService();
    const app = createConfigRoutes(configService, envService);

    const res = await app.request("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm: { provider: "invalid" } }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("llm.provider");
    expect(body.field).toBe("llm.provider");
  });

  it("GET /api/env 返回遮蔽后的变量列表", async () => {
    const vars: EnvVar[] = [
      { key: "AGENT_API_KEY", maskedValue: "••••••••", isSet: true, inExample: true },
      { key: "AGENT_TELEGRAM_TOKEN", maskedValue: "", isSet: false, inExample: true },
    ];
    const configService = makeMockConfigService();
    const envService = makeMockEnvService({
      getEnvVars: vi.fn().mockReturnValue(vars),
    });
    const app = createConfigRoutes(configService, envService);

    const res = await app.request("/api/env");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].key).toBe("AGENT_API_KEY");
    expect(body[0].maskedValue).toBe("••••••••");
    expect(body[1].isSet).toBe(false);
  });

  it("PUT /api/env 合法键名返回 200", async () => {
    const configService = makeMockConfigService();
    const envService = makeMockEnvService();
    const app = createConfigRoutes(configService, envService);

    const res = await app.request("/api/env", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ AGENT_API_KEY: "new-key-value" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(envService.updateEnvVars).toHaveBeenCalledWith({ AGENT_API_KEY: "new-key-value" });
  });

  it("PUT /api/env 未知键名返回 400", async () => {
    const configService = makeMockConfigService();
    const envService = makeMockEnvService({
      updateEnvVars: vi.fn().mockImplementation(() => {
        throw new UnknownEnvKeyError(["UNKNOWN_KEY", "ANOTHER_BAD_KEY"]);
      }),
    });
    const app = createConfigRoutes(configService, envService);

    const res = await app.request("/api/env", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ UNKNOWN_KEY: "val", ANOTHER_BAD_KEY: "val2" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unknown");
    expect(body.invalidKeys).toEqual(["UNKNOWN_KEY", "ANOTHER_BAD_KEY"]);
  });
});
