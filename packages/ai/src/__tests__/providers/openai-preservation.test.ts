/**
 * Preservation Property Tests — toOpenAIMessages baseline behavior
 *
 * **Validates: Requirements 3.2, 3.3**
 *
 * These tests MUST PASS on UNFIXED code to establish baseline behavior.
 * They capture non-buggy behavior that must be preserved after the fix.
 *
 * Property 4: Plain assistant messages (no toolCalls) → no tool_calls in output
 * Property 5: Tool messages → preserves tool_call_id and content
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import type { Message, ProviderConfig } from "../../types.js";

// Mock the openai module before importing the provider
vi.mock("openai", () => {
  const APIError = class extends Error {
    status?: number;
    constructor(
      status: number | undefined,
      _error: unknown,
      message: string,
    ) {
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

describe("Preservation — toOpenAIMessages baseline behavior", () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider(defaultConfig);
  });

  /**
   * Property 4: Plain assistant messages without toolCalls produce no tool_calls
   *
   * **Validates: Requirements 3.2**
   *
   * For any assistant message without toolCalls, toOpenAIMessages output
   * has role "assistant", matching content, and no tool_calls field.
   */
  it("should convert plain assistant messages without tool_calls field", async () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        (content) => {
          const messages: Message[] = [
            { role: "assistant", content },
          ];

          const result = provider.toOpenAIMessages(messages);

          expect(result).toHaveLength(1);
          expect(result[0].role).toBe("assistant");

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = result[0] as any;
          expect(msg.content).toBe(content);

          // Plain assistant messages should NOT have tool_calls
          expect(msg.tool_calls).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5: Tool messages preserve tool_call_id and content
   *
   * **Validates: Requirements 3.3**
   *
   * For any tool message with toolCallId, toOpenAIMessages output
   * has role "tool", matching content, and correct tool_call_id.
   */
  it("should preserve tool_call_id and content for tool messages", async () => {
    fc.assert(
      fc.property(
        fc.record({
          content: fc.string({ minLength: 1, maxLength: 200 }),
          toolCallId: fc.stringMatching(/^call_[a-zA-Z0-9]{1,15}$/),
        }),
        ({ content, toolCallId }) => {
          const messages: Message[] = [
            { role: "tool", content, toolCallId },
          ];

          const result = provider.toOpenAIMessages(messages);

          expect(result).toHaveLength(1);
          expect(result[0].role).toBe("tool");

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = result[0] as any;
          expect(msg.content).toBe(content);
          expect(msg.tool_call_id).toBe(toolCallId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
