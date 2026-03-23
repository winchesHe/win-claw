import Anthropic from "@anthropic-ai/sdk";
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

type AnthropicMessageParam = Anthropic.Messages.MessageParam;
type AnthropicTool = Anthropic.Messages.Tool;
type AnthropicContentBlock = Anthropic.Messages.ContentBlock;
type AnthropicRawMessageStreamEvent =
  Anthropic.Messages.RawMessageStreamEvent;

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly retry: RetryHandler;

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model;
    this.retry = new RetryHandler();
  }

  async chat(
    messages: Message[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? this.model;
    const { system, messages: anthropicMessages } =
      this.toAnthropicMessages(messages);
    const tools = options?.tools
      ? this.toAnthropicTools(options.tools)
      : undefined;

    return this.retry.execute(async () => {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: options?.maxTokens ?? 4096,
          messages: anthropicMessages,
          system: system ?? undefined,
          tools: tools?.length ? tools : undefined,
          temperature: options?.temperature ?? undefined,
          stream: false,
        });

        // Extract text content
        const textContent = response.content
          .filter(
            (block): block is Anthropic.Messages.TextBlock =>
              block.type === "text",
          )
          .map((block) => block.text)
          .join("");

        // Extract tool calls
        const toolCalls = this.fromAnthropicToolUse(response.content);

        return {
          content: textContent,
          toolCalls: toolCalls.length ? toolCalls : undefined,
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens:
              response.usage.input_tokens + response.usage.output_tokens,
          },
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
    const { system, messages: anthropicMessages } =
      this.toAnthropicMessages(messages);
    const tools = options?.tools
      ? this.toAnthropicTools(options.tools)
      : undefined;

    const stream = this.retry.executeStream(async function* (
      this: AnthropicProvider,
    ) {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: options?.maxTokens ?? 4096,
          messages: anthropicMessages,
          system: system ?? undefined,
          tools: tools?.length ? tools : undefined,
          temperature: options?.temperature ?? undefined,
          stream: true,
        });

        let currentToolId: string | undefined;
        let currentToolName: string | undefined;

        for await (const event of response as AsyncIterable<AnthropicRawMessageStreamEvent>) {
          const chunk = this.processStreamEvent(
            event,
            currentToolId,
            currentToolName,
          );

          // Track current tool use state for input_json_delta
          if (
            event.type === "content_block_start" &&
            event.content_block.type === "tool_use"
          ) {
            currentToolId = event.content_block.id;
            currentToolName = event.content_block.name;
          }
          if (event.type === "content_block_stop") {
            currentToolId = undefined;
            currentToolName = undefined;
          }

          if (chunk) {
            yield chunk;
          }
        }

        yield { done: true };
      } catch (error) {
        throw this.wrapError(error);
      }
    }.bind(this));

    yield* stream;
  }

  /** Process a single stream event into a ChatChunk or null */
  private processStreamEvent(
    event: AnthropicRawMessageStreamEvent,
    currentToolId?: string,
    currentToolName?: string,
  ): ChatChunk | null {
    switch (event.type) {
      case "content_block_start": {
        if (event.content_block.type === "text" && event.content_block.text) {
          return { content: event.content_block.text };
        }
        if (event.content_block.type === "tool_use") {
          return {
            toolCalls: [
              {
                id: event.content_block.id,
                name: event.content_block.name,
              },
            ],
          };
        }
        return null;
      }
      case "content_block_delta": {
        if (event.delta.type === "text_delta") {
          return { content: event.delta.text };
        }
        if (event.delta.type === "input_json_delta") {
          return {
            toolCalls: [
              {
                id: currentToolId,
                name: currentToolName,
                arguments: event.delta.partial_json,
              },
            ],
          };
        }
        return null;
      }
      default:
        return null;
    }
  }

  /** Convert unified Message[] to Anthropic format, extracting system messages */
  toAnthropicMessages(messages: Message[]): {
    system?: string;
    messages: AnthropicMessageParam[];
  } {
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const system = systemMessages.length
      ? systemMessages
          .map((m) =>
            typeof m.content === "string"
              ? m.content
              : m.content.map((p) => p.text).join(""),
          )
          .join("\n")
      : undefined;

    const anthropicMessages: AnthropicMessageParam[] = nonSystemMessages.map(
      (msg) => {
        if (msg.role === "tool") {
          return {
            role: "user" as const,
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: msg.toolCallId ?? "",
                content:
                  typeof msg.content === "string"
                    ? msg.content
                    : msg.content.map((p) => p.text).join(""),
              },
            ],
          };
        }

        const content =
          typeof msg.content === "string"
            ? msg.content
            : msg.content.map((part) => ({
                type: "text" as const,
                text: part.text,
              }));

        const role: "user" | "assistant" =
          msg.role === "assistant" ? "assistant" : "user";

        return { role, content };
      },
    );

    return { system, messages: anthropicMessages };
  }

  /** Convert unified ToolDefinition[] to Anthropic tool format */
  toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
    return tools.map(
      (tool): AnthropicTool => ({
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: "object" as const,
          ...tool.parameters,
        },
      }),
    );
  }

  /** Convert Anthropic tool_use content blocks to unified ToolCall[] */
  fromAnthropicToolUse(content: AnthropicContentBlock[]): ToolCall[] {
    return content
      .filter(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use",
      )
      .map((block) => ({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input),
      }));
  }

  /** Wrap Anthropic SDK errors into ProviderError */
  private wrapError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    if (error instanceof Anthropic.APIError) {
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
