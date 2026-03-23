import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
} from "@google/generative-ai";
import type {
  Content,
  Part,
  FunctionDeclaration,
  FunctionDeclarationsTool,
  GenerateContentResult,
  GenerateContentStreamResult,
} from "@google/generative-ai";
import type {
  ChatOptions,
  ChatResponse,
  ChatChunk,
  LLMProvider,
  Message,
  ProviderConfig,
  ToolCall,
  ToolDefinition,
} from "../types.js";
import { ProviderError } from "../errors.js";
import { RetryHandler } from "../retry.js";

export class GoogleProvider implements LLMProvider {
  readonly name = "google";
  private readonly client: GoogleGenerativeAI;
  private readonly model: string;
  private readonly retry: RetryHandler;

  constructor(config: ProviderConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = config.model;
    this.retry = new RetryHandler();
  }

  async chat(
    messages: Message[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const modelName = options?.model ?? this.model;
    const { systemInstruction, contents } = this.toGeminiContents(messages);
    const tools = options?.tools
      ? this.toGeminiTools(options.tools)
      : undefined;

    return this.retry.execute(async () => {
      try {
        const model = this.client.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction ?? undefined,
          generationConfig: {
            temperature: options?.temperature ?? undefined,
            maxOutputTokens: options?.maxTokens ?? undefined,
          },
        });

        const result: GenerateContentResult = await model.generateContent({
          contents,
          tools: tools ? [tools] : undefined,
        });

        const response = result.response;
        const candidate = response.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];

        // Extract text content
        const textContent = parts
          .filter((p): p is Part & { text: string } => p.text != null)
          .map((p) => p.text)
          .join("");

        // Extract tool calls
        const toolCalls = this.fromGeminiFunctionCalls(parts);

        return {
          content: textContent,
          toolCalls: toolCalls.length ? toolCalls : undefined,
          usage: response.usageMetadata
            ? {
                promptTokens: response.usageMetadata.promptTokenCount ?? 0,
                completionTokens:
                  response.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: response.usageMetadata.totalTokenCount ?? 0,
              }
            : undefined,
        };
      } catch (error) {
        throw this.wrapError(error);
      }
    });
  }

  async *chatStream(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncIterable<ChatChunk> {
    const modelName = options?.model ?? this.model;
    const { systemInstruction, contents } = this.toGeminiContents(messages);
    const tools = options?.tools
      ? this.toGeminiTools(options.tools)
      : undefined;

    const stream = this.retry.executeStream(async function* (
      this: GoogleProvider,
    ) {
      try {
        const model = this.client.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction ?? undefined,
          generationConfig: {
            temperature: options?.temperature ?? undefined,
            maxOutputTokens: options?.maxTokens ?? undefined,
          },
        });

        const result: GenerateContentStreamResult =
          await model.generateContentStream({
            contents,
            tools: tools ? [tools] : undefined,
          });

        for await (const chunk of result.stream) {
          const candidate = chunk.candidates?.[0];
          const parts = candidate?.content?.parts ?? [];

          const textContent = parts
            .filter((p): p is Part & { text: string } => p.text != null)
            .map((p) => p.text)
            .join("");

          const toolCalls = this.fromGeminiFunctionCalls(parts);

          const chatChunk: ChatChunk = {};

          if (textContent) {
            chatChunk.content = textContent;
          }

          if (toolCalls.length) {
            chatChunk.toolCalls = toolCalls;
          }

          if (chatChunk.content || chatChunk.toolCalls) {
            yield chatChunk;
          }
        }

        yield { done: true };
      } catch (error) {
        throw this.wrapError(error);
      }
    }.bind(this));

    yield* stream;
  }

  /** Convert unified Message[] to Gemini Content format, extracting system messages */
  toGeminiContents(messages: Message[]): {
    systemInstruction?: string;
    contents: Content[];
  } {
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const systemInstruction = systemMessages.length
      ? systemMessages
          .map((m) =>
            typeof m.content === "string"
              ? m.content
              : m.content.map((p) => p.text).join(""),
          )
          .join("\n")
      : undefined;

    const contents: Content[] = nonSystemMessages.map((msg) => {
      if (msg.role === "tool") {
        // Tool results are sent as functionResponse parts
        const responseContent =
          typeof msg.content === "string"
            ? msg.content
            : msg.content.map((p) => p.text).join("");

        let responseObj: object;
        try {
          responseObj = JSON.parse(responseContent);
        } catch {
          responseObj = { result: responseContent };
        }

        return {
          role: "function",
          parts: [
            {
              functionResponse: {
                name: msg.toolCallId ?? "",
                response: responseObj,
              },
            },
          ],
        };
      }

      // Gemini uses "model" instead of "assistant"
      const role = msg.role === "assistant" ? "model" : "user";

      const parts: Part[] =
        typeof msg.content === "string"
          ? [{ text: msg.content }]
          : msg.content.map((part) => ({ text: part.text }));

      return { role, parts };
    });

    return { systemInstruction, contents };
  }

  /** Convert unified ToolDefinition[] to Gemini FunctionDeclarationsTool format */
  toGeminiTools(tools: ToolDefinition[]): FunctionDeclarationsTool {
    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as FunctionDeclaration["parameters"],
    }));

    return { functionDeclarations };
  }

  /** Convert Gemini functionCall parts to unified ToolCall[] */
  fromGeminiFunctionCalls(parts: Part[]): ToolCall[] {
    return parts
      .filter(
        (part): part is Part & { functionCall: { name: string; args: object } } =>
          part.functionCall != null,
      )
      .map((part, index) => ({
        id: `gemini_call_${index}`,
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args),
      }));
  }

  /** Wrap Google SDK errors into ProviderError */
  private wrapError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    if (error instanceof GoogleGenerativeAIFetchError) {
      return new ProviderError(
        error.message,
        this.name,
        error.status ?? undefined,
        { cause: error },
      );
    }

    const message =
      error instanceof Error ? error.message : String(error);
    return new ProviderError(message, this.name, undefined, {
      cause: error,
    });
  }
}
