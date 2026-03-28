/**
 * Bug Condition Exploration Test — Assistant ToolCalls Conversion
 *
 * **Validates: Requirements 1.4, 2.4**
 *
 * This test MUST FAIL on unfixed code to confirm the bug exists.
 * On UNFIXED code: tool_calls is missing from the converted assistant message → test FAILS.
 * After fix: toOpenAIMessages correctly converts toolCalls to tool_calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message, ProviderConfig } from "../../types.js";

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

import { OpenAIProvider } from "../../providers/openai.js";

const defaultConfig: ProviderConfig = {
  apiKey: "test-key",
  model: "gpt-4o",
};

describe("Bug Exploration — Assistant toolCalls lost in toOpenAIMessages", () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider(defaultConfig);
  });

  it("should convert assistant message toolCalls to OpenAI tool_calls format", () => {
    // Assistant message with toolCalls (as produced by loop.ts)
    const messages: Message[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "file.list", arguments: "{}" }],
      } as Message,
    ];

    const result = provider.toOpenAIMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("assistant");

    // Expected behavior: the output should have tool_calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assistantMsg = result[0] as any;
    expect(assistantMsg.tool_calls).toBeDefined();
    expect(assistantMsg.tool_calls).toHaveLength(1);
    expect(assistantMsg.tool_calls[0].id).toBe("call_1");
    expect(assistantMsg.tool_calls[0].function.name).toBe("file.list");
    expect(assistantMsg.tool_calls[0].function.arguments).toBe("{}");
  });
});
