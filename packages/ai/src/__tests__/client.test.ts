import { describe, it, expect, vi } from "vitest";
import { AIClient, createAIClient, createAIClientFromConfig } from "../client.js";
import type { LLMConfig, ChatChunk } from "../types.js";
import { AIError } from "../errors.js";

/**
 * We mock all four provider modules so the AIClient constructor
 * doesn't try to instantiate real SDK clients (which need network / keys).
 */
vi.mock("../providers/openai.js", () => ({
  OpenAIProvider: vi.fn().mockImplementation((config) => ({
    name: "openai",
    chat: vi.fn().mockResolvedValue({ content: "openai-response" }),
    async *chatStream() {
      yield { content: "openai-chunk" };
      yield { done: true };
    },
    _config: config,
  })),
}));

vi.mock("../providers/anthropic.js", () => ({
  AnthropicProvider: vi.fn().mockImplementation((config) => ({
    name: "anthropic",
    chat: vi.fn().mockResolvedValue({ content: "anthropic-response" }),
    async *chatStream() {
      yield { content: "anthropic-chunk" };
      yield { done: true };
    },
    _config: config,
  })),
}));

vi.mock("../providers/google.js", () => ({
  GoogleProvider: vi.fn().mockImplementation((config) => ({
    name: "google",
    chat: vi.fn().mockResolvedValue({ content: "google-response" }),
    async *chatStream() {
      yield { content: "google-chunk" };
      yield { done: true };
    },
    _config: config,
  })),
}));

vi.mock("../providers/openai-compatible.js", () => ({
  OpenAICompatibleProvider: vi.fn().mockImplementation((config) => ({
    name: "openai-compatible",
    chat: vi.fn().mockResolvedValue({ content: "compatible-response" }),
    async *chatStream() {
      yield { content: "compatible-chunk" };
      yield { done: true };
    },
    _config: config,
  })),
}));

const baseConfig: LLMConfig = {
  provider: "openai",
  model: "gpt-4o",
  apiKey: "test-key",
};

describe("AIClient", () => {
  it("constructor pre-registers all 4 built-in providers", () => {
    // Creating with each provider name should succeed (no "not registered" error)
    for (const provider of ["openai", "anthropic", "google", "openai-compatible"]) {
      const client = new AIClient({ ...baseConfig, provider });
      expect(client.getCurrentProvider()).toBe(provider);
    }
  });

  it("constructor throws for unknown provider", () => {
    expect(() => new AIClient({ ...baseConfig, provider: "unknown" })).toThrow(AIError);
    expect(() => new AIClient({ ...baseConfig, provider: "unknown" })).toThrow(/unknown/);
  });

  it("getCurrentProvider returns the current provider name", () => {
    const client = new AIClient(baseConfig);
    expect(client.getCurrentProvider()).toBe("openai");
  });

  it("chat delegates to current provider", async () => {
    const client = new AIClient(baseConfig);
    const messages = [{ role: "user" as const, content: "hello" }];
    const response = await client.chat(messages);
    expect(response.content).toBe("openai-response");
  });

  it("chatStream delegates to current provider", async () => {
    const client = new AIClient(baseConfig);
    const messages = [{ role: "user" as const, content: "hello" }];
    const chunks: ChatChunk[] = [];
    for await (const chunk of client.chatStream(messages)) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBe(2);
    expect(chunks[0].content).toBe("openai-chunk");
    expect(chunks[1].done).toBe(true);
  });

  it("switchProvider changes the active provider", () => {
    const client = new AIClient(baseConfig);
    expect(client.getCurrentProvider()).toBe("openai");

    client.switchProvider("anthropic");
    expect(client.getCurrentProvider()).toBe("anthropic");
  });

  it("switchProvider makes subsequent chat calls use the new provider", async () => {
    const client = new AIClient(baseConfig);
    client.switchProvider("anthropic");

    const response = await client.chat([{ role: "user", content: "hi" }]);
    expect(response.content).toBe("anthropic-response");
  });

  it("switchProvider makes subsequent chatStream calls use the new provider", async () => {
    const client = new AIClient(baseConfig);
    client.switchProvider("google");

    const chunks: ChatChunk[] = [];
    for await (const chunk of client.chatStream([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }
    expect(chunks[0].content).toBe("google-chunk");
  });

  it("switchProvider accepts partial config overrides", () => {
    const client = new AIClient(baseConfig);
    client.switchProvider("anthropic", {
      model: "claude-3-opus",
      apiKey: "new-key",
    });
    expect(client.getCurrentProvider()).toBe("anthropic");
  });

  it("switchProvider throws for unknown provider", () => {
    const client = new AIClient(baseConfig);
    expect(() => client.switchProvider("nonexistent")).toThrow(AIError);
  });
});

describe("createAIClient", () => {
  it("creates an AIClient from config", () => {
    const client = createAIClient(baseConfig);
    expect(client).toBeInstanceOf(AIClient);
    expect(client.getCurrentProvider()).toBe("openai");
  });
});

describe("createAIClientFromConfig", () => {
  it("loads YAML config and creates AIClient", () => {
    // Mock ConfigLoader.fromYAML
    vi.mock("../config.js", () => ({
      ConfigLoader: {
        fromYAML: vi.fn().mockReturnValue({
          provider: "google",
          model: "gemini-pro",
          apiKey: "yaml-key",
        }),
      },
    }));

    // Re-import to pick up the mock — but since vi.mock is hoisted,
    // the already-imported createAIClientFromConfig will use the mock.
    const client = createAIClientFromConfig("/path/to/config.yaml");
    expect(client).toBeInstanceOf(AIClient);
    expect(client.getCurrentProvider()).toBe("google");
  });
});
