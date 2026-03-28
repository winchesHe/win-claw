import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../registry.js";
import { AIError } from "../errors.js";
import type { ProviderConfig, LLMProvider } from "../types.js";

/** Helper: create a stub LLMProvider */
function stubProvider(name: string): LLMProvider {
  return {
    name,
    chat: async () => ({ content: "" }),
    async *chatStream() {},
  };
}

describe("ProviderRegistry", () => {
  it("should register and create a provider", () => {
    const registry = new ProviderRegistry();
    registry.register("test", () => stubProvider("test"));

    const provider = registry.create("test", {
      apiKey: "key",
      model: "model",
    });

    expect(provider.name).toBe("test");
    expect(typeof provider.chat).toBe("function");
    expect(typeof provider.chatStream).toBe("function");
  });

  it("should pass config to the factory function", () => {
    const registry = new ProviderRegistry();
    let receivedConfig: ProviderConfig | undefined;

    registry.register("test", (config) => {
      receivedConfig = config;
      return stubProvider("test");
    });

    const config: ProviderConfig = {
      apiKey: "my-key",
      model: "gpt-4o",
      baseUrl: "https://custom.api",
    };
    registry.create("test", config);

    expect(receivedConfig).toEqual(config);
  });

  it("should throw AIError with provider name for unregistered provider", () => {
    const registry = new ProviderRegistry();

    expect(() => registry.create("nonexistent", { apiKey: "k", model: "m" })).toThrow(AIError);

    expect(() => registry.create("nonexistent", { apiKey: "k", model: "m" })).toThrow(
      /nonexistent/,
    );
  });

  it("has() returns true for registered providers", () => {
    const registry = new ProviderRegistry();
    registry.register("openai", () => stubProvider("openai"));

    expect(registry.has("openai")).toBe(true);
  });

  it("has() returns false for unregistered providers", () => {
    const registry = new ProviderRegistry();

    expect(registry.has("unknown")).toBe(false);
  });

  it("should allow overwriting a registered provider", () => {
    const registry = new ProviderRegistry();
    registry.register("test", () => stubProvider("v1"));
    registry.register("test", () => stubProvider("v2"));

    const provider = registry.create("test", {
      apiKey: "k",
      model: "m",
    });

    expect(provider.name).toBe("v2");
  });
});
