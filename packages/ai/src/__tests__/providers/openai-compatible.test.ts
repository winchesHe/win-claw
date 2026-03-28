import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProviderConfig } from "../../types.js";

// Mock the openai module before importing the provider
vi.mock("openai", () => {
  const APIError = class extends Error {
    status?: number;
    constructor(status: number | undefined, _error: unknown, message: string) {
      super(message);
      this.status = status;
      this.name = "APIError";
    }
  };

  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (MockOpenAI as any).APIError = APIError;

  return { default: MockOpenAI, APIError };
});

import { OpenAICompatibleProvider } from "../../providers/openai-compatible.js";
import { OpenAIProvider } from "../../providers/openai.js";
import OpenAI from "openai";

const defaultConfig: ProviderConfig = {
  apiKey: "test-key",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com/v1",
};

describe("OpenAICompatibleProvider", () => {
  let provider: OpenAICompatibleProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAICompatibleProvider(defaultConfig);
  });

  it('should have name "openai-compatible"', () => {
    expect(provider.name).toBe("openai-compatible");
  });

  it("should be an instance of OpenAIProvider", () => {
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it("should inherit chat and chatStream from OpenAIProvider", () => {
    expect(typeof provider.chat).toBe("function");
    expect(typeof provider.chatStream).toBe("function");
  });

  it("should pass baseUrl through to the OpenAI client", () => {
    const config: ProviderConfig = {
      apiKey: "my-key",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
    };
    new OpenAICompatibleProvider(config);
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: "my-key",
      baseURL: "https://api.deepseek.com/v1",
    });
  });

  it("should work without baseUrl (falls back to OpenAI default)", () => {
    const config: ProviderConfig = {
      apiKey: "my-key",
      model: "gpt-4o",
    };
    new OpenAICompatibleProvider(config);
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: "my-key",
      baseURL: undefined,
    });
  });
});
