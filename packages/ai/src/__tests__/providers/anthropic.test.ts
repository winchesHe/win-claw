import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Message,
  ToolDefinition,
  ProviderConfig,
  ChatChunk,
} from "../../types.js";

// Mock the @anthropic-ai/sdk module before importing the provider
vi.mock("@anthropic-ai/sdk", () => {
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

  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (MockAnthropic as any).APIError = APIError;

  return { default: MockAnthropic, APIError };
});

import { AnthropicProvider } from "../../providers/anthropic.js";
import Anthropic from "@anthropic-ai/sdk";

const defaultConfig: ProviderConfig = {
  apiKey: "test-key",
  model: "claude-sonnet-4-20250514",
};

function getClient(provider: AnthropicProvider) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (provider as any).client as {
    messages: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicProvider(defaultConfig);
  });

  describe("constructor", () => {
    it("should set name to anthropic", () => {
      expect(provider.name).toBe("anthropic");
    });

    it("should pass apiKey to Anthropic client", () => {
      new AnthropicProvider({ apiKey: "my-key", model: "claude-sonnet-4-20250514" });
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: "my-key" });
    });
  });

  describe("toAnthropicMessages", () => {
    it("should extract system messages as top-level system parameter", () => {
      const messages: Message[] = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ];
      const result = provider.toAnthropicMessages(messages);
      expect(result.system).toBe("You are helpful");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
    });

    it("should concatenate multiple system messages", () => {
      const messages: Message[] = [
        { role: "system", content: "Be helpful" },
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hi" },
      ];
      const result = provider.toAnthropicMessages(messages);
      expect(result.system).toBe("Be helpful\nBe concise");
    });

    it("should return undefined system when no system messages", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];
      const result = provider.toAnthropicMessages(messages);
      expect(result.system).toBeUndefined();
    });

    it("should convert user message with string content", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];
      const result = provider.toAnthropicMessages(messages);
      expect(result.messages).toEqual([
        { role: "user", content: "Hello" },
      ]);
    });

    it("should convert assistant message", () => {
      const messages: Message[] = [
        { role: "assistant", content: "Hi there" },
      ];
      const result = provider.toAnthropicMessages(messages);
      expect(result.messages).toEqual([
        { role: "assistant", content: "Hi there" },
      ]);
    });

    it("should convert tool message to user message with tool_result block", () => {
      const messages: Message[] = [
        {
          role: "tool",
          content: '{"result": 42}',
          toolCallId: "call_123",
        },
      ];
      const result = provider.toAnthropicMessages(messages);
      expect(result.messages).toEqual([
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_123",
              content: '{"result": 42}',
            },
          ],
        },
      ]);
    });

    it("should convert ContentPart array to text blocks", () => {
      const messages: Message[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello world" }],
        },
      ];
      const result = provider.toAnthropicMessages(messages);
      expect(result.messages).toEqual([
        {
          role: "user",
          content: [{ type: "text", text: "Hello world" }],
        },
      ]);
    });

    it("should handle empty messages array", () => {
      const result = provider.toAnthropicMessages([]);
      expect(result.system).toBeUndefined();
      expect(result.messages).toEqual([]);
    });

    it("should handle system message with ContentPart array", () => {
      const messages: Message[] = [
        {
          role: "system",
          content: [{ type: "text", text: "Be helpful" }],
        },
        { role: "user", content: "Hi" },
      ];
      const result = provider.toAnthropicMessages(messages);
      expect(result.system).toBe("Be helpful");
    });
  });

  describe("toAnthropicTools", () => {
    it("should convert ToolDefinition to Anthropic tool format", () => {
      const tools: ToolDefinition[] = [
        {
          name: "get_weather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
        },
      ];
      const result = provider.toAnthropicTools(tools);
      expect(result).toEqual([
        {
          name: "get_weather",
          description: "Get weather for a location",
          input_schema: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
        },
      ]);
    });

    it("should handle empty tools array", () => {
      const result = provider.toAnthropicTools([]);
      expect(result).toEqual([]);
    });

    it("should convert multiple tools", () => {
      const tools: ToolDefinition[] = [
        { name: "tool_a", description: "Tool A", parameters: {} },
        {
          name: "tool_b",
          description: "Tool B",
          parameters: { type: "object" },
        },
      ];
      const result = provider.toAnthropicTools(tools);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("tool_a");
      expect(result[1].name).toBe("tool_b");
    });
  });

  describe("fromAnthropicToolUse", () => {
    it("should convert tool_use content blocks to unified ToolCall", () => {
      const content = [
        {
          type: "tool_use" as const,
          id: "toolu_abc",
          name: "get_weather",
          input: { location: "Tokyo" },
          caller: { type: "direct" as const },
        },
      ];
      const result = provider.fromAnthropicToolUse(content);
      expect(result).toEqual([
        {
          id: "toolu_abc",
          name: "get_weather",
          arguments: '{"location":"Tokyo"}',
        },
      ]);
    });

    it("should handle multiple tool_use blocks", () => {
      const content = [
        {
          type: "tool_use" as const,
          id: "toolu_1",
          name: "fn_a",
          input: {},
          caller: { type: "direct" as const },
        },
        {
          type: "tool_use" as const,
          id: "toolu_2",
          name: "fn_b",
          input: { x: 1 },
          caller: { type: "direct" as const },
        },
      ];
      const result = provider.fromAnthropicToolUse(content);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("toolu_1");
      expect(result[1].id).toBe("toolu_2");
    });

    it("should filter out non-tool_use content blocks", () => {
      const content = [
        {
          type: "text" as const,
          text: "Hello",
          citations: null,
        },
        {
          type: "tool_use" as const,
          id: "toolu_1",
          name: "fn_a",
          input: {},
          caller: { type: "direct" as const },
        },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = provider.fromAnthropicToolUse(content as any);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("toolu_1");
    });
  });

  describe("chat", () => {
    it("should call Anthropic API and return ChatResponse", async () => {
      const client = getClient(provider);
      client.messages.create.mockResolvedValue({
        content: [
          { type: "text", text: "Hello!" },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
        stop_reason: "end_turn",
      });

      const result = await provider.chat([
        { role: "user", content: "Hi" },
      ]);

      expect(result.content).toBe("Hello!");
      expect(result.toolCalls).toBeUndefined();
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    });

    it("should pass system message as top-level parameter", async () => {
      const client = getClient(provider);
      client.messages.create.mockResolvedValue({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 5, output_tokens: 2 },
      });

      await provider.chat([
        { role: "system", content: "Be helpful" },
        { role: "user", content: "Hi" },
      ]);

      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: "Be helpful",
          messages: [{ role: "user", content: "Hi" }],
          stream: false,
        }),
      );
    });

    it("should pass tools and options to Anthropic API", async () => {
      const client = getClient(provider);
      client.messages.create.mockResolvedValue({
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "get_weather",
            input: { location: "NYC" },
          },
        ],
        usage: { input_tokens: 20, output_tokens: 10 },
      });

      const tools: ToolDefinition[] = [
        {
          name: "get_weather",
          description: "Get weather",
          parameters: { type: "object" },
        },
      ];

      const result = await provider.chat(
        [{ role: "user", content: "Weather?" }],
        { tools, temperature: 0.5, maxTokens: 100 },
      );

      expect(result.toolCalls).toEqual([
        {
          id: "toolu_1",
          name: "get_weather",
          arguments: '{"location":"NYC"}',
        },
      ]);

      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          temperature: 0.5,
          max_tokens: 100,
          stream: false,
        }),
      );
    });

    it("should use options.model when provided", async () => {
      const client = getClient(provider);
      client.messages.create.mockResolvedValue({
        content: [{ type: "text", text: "ok" }],
        usage: { input_tokens: 5, output_tokens: 2 },
      });

      await provider.chat(
        [{ role: "user", content: "test" }],
        { model: "claude-3-haiku-20240307" },
      );

      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-3-haiku-20240307" }),
      );
    });

    it("should wrap Anthropic APIError into ProviderError", async () => {
      const client = getClient(provider);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiError = new (Anthropic as any).APIError(
        401,
        {},
        "Unauthorized",
      );
      client.messages.create.mockRejectedValue(apiError);

      await expect(
        provider.chat([{ role: "user", content: "test" }]),
      ).rejects.toMatchObject({
        name: "ProviderError",
        provider: "anthropic",
        statusCode: 401,
      });
    });

    it("should handle mixed text and tool_use content blocks", async () => {
      const client = getClient(provider);
      client.messages.create.mockResolvedValue({
        content: [
          { type: "text", text: "Let me check the weather." },
          {
            type: "tool_use",
            id: "toolu_1",
            name: "get_weather",
            input: { location: "NYC" },
          },
        ],
        usage: { input_tokens: 15, output_tokens: 20 },
      });

      const result = await provider.chat([
        { role: "user", content: "What's the weather?" },
      ]);

      expect(result.content).toBe("Let me check the weather.");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe("get_weather");
    });
  });

  describe("chatStream", () => {
    it("should yield ChatChunks from streaming response", async () => {
      const client = getClient(provider);

      async function* mockStream() {
        yield {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        };
        yield {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello" },
        };
        yield {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: " world" },
        };
        yield {
          type: "content_block_stop",
          index: 0,
        };
        yield {
          type: "message_stop",
        };
      }

      client.messages.create.mockResolvedValue(mockStream());

      const chunks: ChatChunk[] = [];
      for await (const chunk of provider.chatStream([
        { role: "user", content: "Hi" },
      ])) {
        chunks.push(chunk);
      }

      // text_delta chunks + done chunk
      expect(chunks).toHaveLength(3);
      expect(chunks[0].content).toBe("Hello");
      expect(chunks[1].content).toBe(" world");
      expect(chunks[2].done).toBe(true);
    });

    it("should yield tool call chunks from streaming response", async () => {
      const client = getClient(provider);

      async function* mockStream() {
        yield {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_1",
            name: "get_weather",
            input: {},
          },
        };
        yield {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: '{"loc',
          },
        };
        yield {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: 'ation":"NYC"}',
          },
        };
        yield {
          type: "content_block_stop",
          index: 0,
        };
        yield {
          type: "message_stop",
        };
      }

      client.messages.create.mockResolvedValue(mockStream());

      const chunks: ChatChunk[] = [];
      for await (const chunk of provider.chatStream([
        { role: "user", content: "test" },
      ])) {
        chunks.push(chunk);
      }

      // tool_use start + 2 input_json_delta + done
      expect(chunks[0].toolCalls).toBeDefined();
      expect(chunks[0].toolCalls![0].id).toBe("toolu_1");
      expect(chunks[0].toolCalls![0].name).toBe("get_weather");
      expect(chunks[1].toolCalls![0].arguments).toBe('{"loc');
      expect(chunks[chunks.length - 1].done).toBe(true);
    });

    it("should skip events with no content or tool data", async () => {
      const client = getClient(provider);

      async function* mockStream() {
        yield {
          type: "message_start",
          message: { id: "msg_1", type: "message", role: "assistant" },
        };
        yield {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        };
        yield {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "data" },
        };
        yield {
          type: "content_block_stop",
          index: 0,
        };
        yield {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: 5 },
        };
        yield {
          type: "message_stop",
        };
      }

      client.messages.create.mockResolvedValue(mockStream());

      const chunks: ChatChunk[] = [];
      for await (const chunk of provider.chatStream([
        { role: "user", content: "test" },
      ])) {
        chunks.push(chunk);
      }

      // Only the "data" content chunk + done
      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe("data");
      expect(chunks[1].done).toBe(true);
    });
  });
});
