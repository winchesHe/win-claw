import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message, ToolDefinition, ProviderConfig, ChatChunk } from "../../types.js";

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
import OpenAI from "openai";

const defaultConfig: ProviderConfig = {
  apiKey: "test-key",
  model: "gpt-4o",
};

function getClient(provider: OpenAIProvider) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (provider as any).client as {
    chat: {
      completions: {
        create: ReturnType<typeof vi.fn>;
      };
    };
  };
}

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider(defaultConfig);
  });

  describe("constructor", () => {
    it("should set name to openai", () => {
      expect(provider.name).toBe("openai");
    });

    it("should pass apiKey and baseUrl to OpenAI client", () => {
      const config: ProviderConfig = {
        apiKey: "my-key",
        model: "gpt-4o",
        baseUrl: "https://custom.api.com",
      };
      new OpenAIProvider(config);
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: "my-key",
        baseURL: "https://custom.api.com",
      });
    });
  });

  describe("toOpenAIMessages", () => {
    it("should convert system message with string content", () => {
      const messages: Message[] = [
        { role: "system", content: "You are helpful" },
      ];
      const result = provider.toOpenAIMessages(messages);
      expect(result).toEqual([
        { role: "system", content: "You are helpful" },
      ]);
    });

    it("should convert user message with string content", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];
      const result = provider.toOpenAIMessages(messages);
      expect(result).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("should convert assistant message", () => {
      const messages: Message[] = [
        { role: "assistant", content: "Hi there" },
      ];
      const result = provider.toOpenAIMessages(messages);
      expect(result).toEqual([
        { role: "assistant", content: "Hi there" },
      ]);
    });

    it("should convert tool message with toolCallId", () => {
      const messages: Message[] = [
        {
          role: "tool",
          content: '{"result": 42}',
          toolCallId: "call_123",
        },
      ];
      const result = provider.toOpenAIMessages(messages);
      expect(result).toEqual([
        {
          role: "tool",
          content: '{"result": 42}',
          tool_call_id: "call_123",
        },
      ]);
    });

    it("should convert ContentPart array to OpenAI text parts", () => {
      const messages: Message[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello world" }],
        },
      ];
      const result = provider.toOpenAIMessages(messages);
      expect(result).toEqual([
        {
          role: "user",
          content: [{ type: "text", text: "Hello world" }],
        },
      ]);
    });

    it("should handle empty messages array", () => {
      const result = provider.toOpenAIMessages([]);
      expect(result).toEqual([]);
    });

    it("should handle mixed message roles", () => {
      const messages: Message[] = [
        { role: "system", content: "Be helpful" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        {
          role: "tool",
          content: "result",
          toolCallId: "call_1",
        },
      ];
      const result = provider.toOpenAIMessages(messages);
      expect(result).toHaveLength(4);
      expect(result[0].role).toBe("system");
      expect(result[1].role).toBe("user");
      expect(result[2].role).toBe("assistant");
      expect(result[3].role).toBe("tool");
    });
  });

  describe("toOpenAITools", () => {
    it("should convert ToolDefinition to OpenAI function tool format", () => {
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
      const result = provider.toOpenAITools(tools);
      expect(result).toEqual([
        {
          type: "function",
          function: {
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
        },
      ]);
    });

    it("should handle empty tools array", () => {
      const result = provider.toOpenAITools([]);
      expect(result).toEqual([]);
    });

    it("should convert multiple tools", () => {
      const tools: ToolDefinition[] = [
        {
          name: "tool_a",
          description: "Tool A",
          parameters: {},
        },
        {
          name: "tool_b",
          description: "Tool B",
          parameters: { type: "object" },
        },
      ];
      const result = provider.toOpenAITools(tools);
      expect(result).toHaveLength(2);
      expect((result[0] as { type: "function"; function: { name: string } }).function.name).toBe("tool_a");
      expect((result[1] as { type: "function"; function: { name: string } }).function.name).toBe("tool_b");
    });
  });

  describe("fromOpenAIToolCalls", () => {
    it("should convert OpenAI function tool calls to unified ToolCall", () => {
      const toolCalls = [
        {
          id: "call_abc",
          type: "function" as const,
          function: {
            name: "get_weather",
            arguments: '{"location":"Tokyo"}',
          },
        },
      ];
      const result = provider.fromOpenAIToolCalls(toolCalls);
      expect(result).toEqual([
        {
          id: "call_abc",
          name: "get_weather",
          arguments: '{"location":"Tokyo"}',
        },
      ]);
    });

    it("should handle multiple tool calls", () => {
      const toolCalls = [
        {
          id: "call_1",
          type: "function" as const,
          function: {
            name: "fn_a",
            arguments: "{}",
          },
        },
        {
          id: "call_2",
          type: "function" as const,
          function: {
            name: "fn_b",
            arguments: '{"x":1}',
          },
        },
      ];
      const result = provider.fromOpenAIToolCalls(toolCalls);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("call_1");
      expect(result[1].id).toBe("call_2");
    });

    it("should filter out non-function tool calls", () => {
      const toolCalls = [
        {
          id: "call_1",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: "custom" as any,
          custom: { name: "test", input: "data" },
        },
        {
          id: "call_2",
          type: "function" as const,
          function: {
            name: "fn_a",
            arguments: "{}",
          },
        },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = provider.fromOpenAIToolCalls(toolCalls as any);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("call_2");
    });
  });

  describe("chat", () => {
    it("should call OpenAI API and return ChatResponse", async () => {
      const client = getClient(provider);
      client.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: "Hello!",
              tool_calls: undefined,
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
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

    it("should pass tools and options to OpenAI API", async () => {
      const client = getClient(provider);
      client.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location":"NYC"}',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
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
          id: "call_1",
          name: "get_weather",
          arguments: '{"location":"NYC"}',
        },
      ]);

      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o",
          temperature: 0.5,
          max_tokens: 100,
          stream: false,
        }),
      );
    });

    it("should use options.model when provided", async () => {
      const client = getClient(provider);
      client.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: "ok" } }],
      });

      await provider.chat(
        [{ role: "user", content: "test" }],
        { model: "gpt-3.5-turbo" },
      );

      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-3.5-turbo" }),
      );
    });

    it("should wrap OpenAI APIError into ProviderError", async () => {
      const client = getClient(provider);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiError = new (OpenAI as any).APIError(
        401,
        {},
        "Unauthorized",
      );
      client.chat.completions.create.mockRejectedValue(apiError);

      await expect(
        provider.chat([{ role: "user", content: "test" }]),
      ).rejects.toMatchObject({
        name: "ProviderError",
        provider: "openai",
        statusCode: 401,
      });
    });
  });

  describe("chatStream", () => {
    it("should yield ChatChunks from streaming response", async () => {
      const client = getClient(provider);

      async function* mockStream() {
        yield {
          choices: [
            { delta: { content: "Hello" } },
          ],
        };
        yield {
          choices: [
            { delta: { content: " world" } },
          ],
        };
      }

      client.chat.completions.create.mockResolvedValue(
        mockStream(),
      );

      const chunks: ChatChunk[] = [];
      for await (const chunk of provider.chatStream([
        { role: "user", content: "Hi" },
      ])) {
        chunks.push(chunk);
      }

      // Content chunks + done chunk
      expect(chunks).toHaveLength(3);
      expect(chunks[0].content).toBe("Hello");
      expect(chunks[1].content).toBe(" world");
      expect(chunks[2].done).toBe(true);
    });

    it("should yield tool call chunks from streaming response", async () => {
      const client = getClient(provider);

      async function* mockStream() {
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    id: "call_1",
                    function: { name: "fn", arguments: '{"a' },
                  },
                ],
              },
            },
          ],
        };
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    function: { arguments: '":1}' },
                  },
                ],
              },
            },
          ],
        };
      }

      client.chat.completions.create.mockResolvedValue(
        mockStream(),
      );

      const chunks: ChatChunk[] = [];
      for await (const chunk of provider.chatStream([
        { role: "user", content: "test" },
      ])) {
        chunks.push(chunk);
      }

      expect(chunks[0].toolCalls).toBeDefined();
      expect(chunks[0].toolCalls![0].id).toBe("call_1");
      expect(chunks[0].toolCalls![0].name).toBe("fn");
      expect(chunks[chunks.length - 1].done).toBe(true);
    });

    it("should skip chunks with no content or tool_calls", async () => {
      const client = getClient(provider);

      async function* mockStream() {
        yield { choices: [{ delta: {} }] };
        yield { choices: [{ delta: { content: "data" } }] };
        yield { choices: [] };
      }

      client.chat.completions.create.mockResolvedValue(
        mockStream(),
      );

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
