import OpenAI from "openai";
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

type OpenAIMessageParam =
  OpenAI.Chat.Completions.ChatCompletionMessageParam;
type OpenAITool = OpenAI.Chat.Completions.ChatCompletionTool;
type OpenAIToolCall =
  OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  protected readonly client: OpenAI;
  protected readonly model: string;
  private readonly retry: RetryHandler;

  constructor(config: ProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model;
    this.retry = new RetryHandler();
  }

  async chat(
    messages: Message[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? this.model;
    const openaiMessages = this.toOpenAIMessages(messages);
    const tools = options?.tools
      ? this.toOpenAITools(options.tools)
      : undefined;

    return this.retry.execute(async () => {
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages: openaiMessages,
          tools: tools?.length ? tools : undefined,
          temperature: options?.temperature ?? undefined,
          max_tokens: options?.maxTokens ?? undefined,
          stream: false,
        });

        const choice = response.choices[0];
        const content = choice?.message?.content ?? "";
        const toolCalls = choice?.message?.tool_calls
          ? this.fromOpenAIToolCalls(
              choice.message.tool_calls as OpenAIToolCall[],
            )
          : undefined;

        return {
          content,
          toolCalls: toolCalls?.length ? toolCalls : undefined,
          usage: response.usage
            ? {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
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
    const model = options?.model ?? this.model;
    const openaiMessages = this.toOpenAIMessages(messages);
    const tools = options?.tools
      ? this.toOpenAITools(options.tools)
      : undefined;

    const stream = this.retry.executeStream(async function* (
      this: OpenAIProvider,
    ) {
      try {
        const response = await this.client.chat.completions.create({
          model,
          messages: openaiMessages,
          tools: tools?.length ? tools : undefined,
          temperature: options?.temperature ?? undefined,
          max_tokens: options?.maxTokens ?? undefined,
          stream: true,
        });

        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          const chatChunk: ChatChunk = {};

          if (delta.content) {
            chatChunk.content = delta.content;
          }

          if (delta.tool_calls?.length) {
            chatChunk.toolCalls = delta.tool_calls.map((tc) => ({
              index: tc.index,
              id: tc.id,
              name: tc.function?.name,
              arguments: tc.function?.arguments,
            }));
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

  /** Convert unified Message[] to OpenAI message format */
  toOpenAIMessages(messages: Message[]): OpenAIMessageParam[] {
    return messages.map((msg): OpenAIMessageParam => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((part) => ({
              type: "text" as const,
              text: part.text,
            }));

      switch (msg.role) {
        case "system":
          return {
            role: "system",
            content: typeof content === "string" ? content : content,
          };
        case "user":
          return {
            role: "user",
            content,
          };
        case "assistant": {
          const assistantMsg: Record<string, unknown> = {
            role: "assistant",
            content: typeof content === "string" ? content : content,
          };
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
              type: "function" as const,
              id: tc.id,
              function: { name: tc.name, arguments: tc.arguments },
            }));
          }
          return assistantMsg as OpenAIMessageParam;
        }
        case "tool":
          return {
            role: "tool",
            content: typeof content === "string" ? content : content[0]?.text ?? "",
            tool_call_id: msg.toolCallId ?? "",
          };
        default:
          return {
            role: "user",
            content: typeof content === "string" ? content : content,
          };
      }
    });
  }

  /** Convert unified ToolDefinition[] to OpenAI tool format */
  toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
    return tools.map(
      (tool): OpenAITool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }),
    );
  }

  /** Convert OpenAI tool_calls to unified ToolCall format */
  fromOpenAIToolCalls(toolCalls: OpenAIToolCall[]): ToolCall[] {
    return toolCalls
      .filter(
        (tc): tc is OpenAIToolCall & { type: "function" } =>
          tc.type === "function",
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
  }

  /** Wrap OpenAI SDK errors into ProviderError */
  private wrapError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    if (error instanceof OpenAI.APIError) {
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
