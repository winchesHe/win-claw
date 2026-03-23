import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Message,
  ToolDefinition,
  ProviderConfig,
  ChatChunk,
} from "../../types.js";

// Mock the @google/generative-ai module before importing the provider
const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
  generateContent: mockGenerateContent,
  generateContentStream: mockGenerateContentStream,
});

vi.mock("@google/generative-ai", () => {
  const GoogleGenerativeAIFetchError = class extends Error {
    status?: number;
    statusText?: string;
    constructor(message: string, status?: number, statusText?: string) {
      super(message);
      this.name = "GoogleGenerativeAIFetchError";
      this.status = status;
      this.statusText = statusText;
    }
  };

  const MockGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  }));

  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
    GoogleGenerativeAIFetchError,
  };
});

import { GoogleProvider } from "../../providers/google.js";
import { GoogleGenerativeAIFetchError } from "@google/generative-ai";

const defaultConfig: ProviderConfig = {
  apiKey: "test-key",
  model: "gemini-2.0-flash",
};

describe("GoogleProvider", () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGenerativeModel.mockReturnValue({
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    });
    provider = new GoogleProvider(defaultConfig);
  });

  describe("constructor", () => {
    it("should set name to google", () => {
      expect(provider.name).toBe("google");
    });
  });

  describe("toGeminiContents", () => {
    it("should extract system messages as systemInstruction", () => {
      const messages: Message[] = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.systemInstruction).toBe("You are helpful");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].role).toBe("user");
    });

    it("should concatenate multiple system messages", () => {
      const messages: Message[] = [
        { role: "system", content: "Be helpful" },
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hi" },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.systemInstruction).toBe("Be helpful\nBe concise");
    });

    it("should return undefined systemInstruction when no system messages", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.systemInstruction).toBeUndefined();
    });

    it("should convert user message with string content to text parts", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.contents).toEqual([
        { role: "user", parts: [{ text: "Hello" }] },
      ]);
    });

    it("should map assistant role to model", () => {
      const messages: Message[] = [
        { role: "assistant", content: "Hi there" },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.contents).toEqual([
        { role: "model", parts: [{ text: "Hi there" }] },
      ]);
    });

    it("should convert tool message to functionResponse part", () => {
      const messages: Message[] = [
        {
          role: "tool",
          content: '{"result": 42}',
          toolCallId: "get_weather",
        },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.contents).toEqual([
        {
          role: "function",
          parts: [
            {
              functionResponse: {
                name: "get_weather",
                response: { result: 42 },
              },
            },
          ],
        },
      ]);
    });

    it("should wrap non-JSON tool content in result object", () => {
      const messages: Message[] = [
        {
          role: "tool",
          content: "plain text result",
          toolCallId: "my_tool",
        },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.contents[0].parts[0]).toEqual({
        functionResponse: {
          name: "my_tool",
          response: { result: "plain text result" },
        },
      });
    });

    it("should convert ContentPart array to text parts", () => {
      const messages: Message[] = [
        {
          role: "user",
          content: [{ type: "text", text: "Hello world" }],
        },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.contents).toEqual([
        { role: "user", parts: [{ text: "Hello world" }] },
      ]);
    });

    it("should handle empty messages array", () => {
      const result = provider.toGeminiContents([]);
      expect(result.systemInstruction).toBeUndefined();
      expect(result.contents).toEqual([]);
    });

    it("should handle system message with ContentPart array", () => {
      const messages: Message[] = [
        {
          role: "system",
          content: [{ type: "text", text: "Be helpful" }],
        },
        { role: "user", content: "Hi" },
      ];
      const result = provider.toGeminiContents(messages);
      expect(result.systemInstruction).toBe("Be helpful");
    });
  });

  describe("toGeminiTools", () => {
    it("should convert ToolDefinition to Gemini FunctionDeclarationsTool format", () => {
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
      const result = provider.toGeminiTools(tools);
      expect(result).toEqual({
        functionDeclarations: [
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
        ],
      });
    });

    it("should handle empty tools array", () => {
      const result = provider.toGeminiTools([]);
      expect(result).toEqual({ functionDeclarations: [] });
    });

    it("should convert multiple tools", () => {
      const tools: ToolDefinition[] = [
        { name: "tool_a", description: "Tool A", parameters: {} },
        { name: "tool_b", description: "Tool B", parameters: { type: "object" } },
      ];
      const result = provider.toGeminiTools(tools);
      expect(result.functionDeclarations).toHaveLength(2);
      expect(result.functionDeclarations![0].name).toBe("tool_a");
      expect(result.functionDeclarations![1].name).toBe("tool_b");
    });
  });

  describe("fromGeminiFunctionCalls", () => {
    it("should convert functionCall parts to unified ToolCall", () => {
      const parts = [
        {
          functionCall: {
            name: "get_weather",
            args: { location: "Tokyo" },
          },
        },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = provider.fromGeminiFunctionCalls(parts as any);
      expect(result).toEqual([
        {
          id: "gemini_call_0",
          name: "get_weather",
          arguments: '{"location":"Tokyo"}',
        },
      ]);
    });

    it("should handle multiple functionCall parts", () => {
      const parts = [
        { functionCall: { name: "fn_a", args: {} } },
        { functionCall: { name: "fn_b", args: { x: 1 } } },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = provider.fromGeminiFunctionCalls(parts as any);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("gemini_call_0");
      expect(result[1].id).toBe("gemini_call_1");
    });

    it("should filter out non-functionCall parts", () => {
      const parts = [
        { text: "Hello" },
        { functionCall: { name: "fn_a", args: {} } },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = provider.fromGeminiFunctionCalls(parts as any);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("fn_a");
    });
  });

  describe("chat", () => {
    it("should call Gemini API and return ChatResponse", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            {
              content: {
                parts: [{ text: "Hello!" }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
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

    it("should pass system message as systemInstruction on model", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            { content: { parts: [{ text: "ok" }] } },
          ],
        },
      });

      await provider.chat([
        { role: "system", content: "Be helpful" },
        { role: "user", content: "Hi" },
      ]);

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction: "Be helpful",
        }),
      );

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        }),
      );
    });

    it("should pass tools and options to Gemini API", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "get_weather",
                      args: { location: "NYC" },
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 20,
            candidatesTokenCount: 10,
            totalTokenCount: 30,
          },
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
          id: "gemini_call_0",
          name: "get_weather",
          arguments: '{"location":"NYC"}',
        },
      ]);

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            temperature: 0.5,
            maxOutputTokens: 100,
          }),
        }),
      );

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              functionDeclarations: [
                {
                  name: "get_weather",
                  description: "Get weather",
                  parameters: { type: "object" },
                },
              ],
            },
          ],
        }),
      );
    });

    it("should use options.model when provided", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            { content: { parts: [{ text: "ok" }] } },
          ],
        },
      });

      await provider.chat(
        [{ role: "user", content: "test" }],
        { model: "gemini-1.5-pro" },
      );

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gemini-1.5-pro" }),
      );
    });

    it("should wrap GoogleGenerativeAIFetchError into ProviderError", async () => {
      const fetchError = new GoogleGenerativeAIFetchError(
        "Unauthorized",
        401,
        "Unauthorized",
      );
      mockGenerateContent.mockRejectedValue(fetchError);

      await expect(
        provider.chat([{ role: "user", content: "test" }]),
      ).rejects.toMatchObject({
        name: "ProviderError",
        provider: "google",
        statusCode: 401,
      });
    });

    it("should handle mixed text and functionCall parts", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            {
              content: {
                parts: [
                  { text: "Let me check." },
                  {
                    functionCall: {
                      name: "get_weather",
                      args: { location: "NYC" },
                    },
                  },
                ],
              },
            },
          ],
        },
      });

      const result = await provider.chat([
        { role: "user", content: "What's the weather?" },
      ]);

      expect(result.content).toBe("Let me check.");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe("get_weather");
    });
  });

  describe("chatStream", () => {
    it("should yield ChatChunks from streaming response", async () => {
      async function* mockStream() {
        yield {
          candidates: [
            { content: { parts: [{ text: "Hello" }] } },
          ],
        };
        yield {
          candidates: [
            { content: { parts: [{ text: " world" }] } },
          ],
        };
      }

      mockGenerateContentStream.mockResolvedValue({
        stream: mockStream(),
      });

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
      async function* mockStream() {
        yield {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "get_weather",
                      args: { location: "NYC" },
                    },
                  },
                ],
              },
            },
          ],
        };
      }

      mockGenerateContentStream.mockResolvedValue({
        stream: mockStream(),
      });

      const chunks: ChatChunk[] = [];
      for await (const chunk of provider.chatStream([
        { role: "user", content: "test" },
      ])) {
        chunks.push(chunk);
      }

      expect(chunks[0].toolCalls).toBeDefined();
      expect(chunks[0].toolCalls![0].name).toBe("get_weather");
      expect(chunks[chunks.length - 1].done).toBe(true);
    });

    it("should skip chunks with no content or tool calls", async () => {
      async function* mockStream() {
        yield { candidates: [{ content: { parts: [] } }] };
        yield {
          candidates: [
            { content: { parts: [{ text: "data" }] } },
          ],
        };
        yield { candidates: [] };
      }

      mockGenerateContentStream.mockResolvedValue({
        stream: mockStream(),
      });

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
