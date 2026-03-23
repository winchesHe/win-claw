import type { Message, ChatChunk } from "@winches/ai";
import type { AgentConfig, AgentEvent, AgentStatus, ApprovalRequest } from "./types.js";
import type pino from "pino";
import { registryToToolDefinitions } from "@winches/core";
import { buildMessages } from "./prompt.js";
import { aggregateStream } from "./stream.js";
import { executeToolCall } from "./dispatch.js";

const RETRY_DELAYS_MS = [1000, 2000, 4000];

export interface LoopContext {
  messages: Message[];
  config: Required<AgentConfig>;
  getStatus: () => AgentStatus;
  setStatus: (s: AgentStatus) => void;
  onApprovalNeeded: ((request: ApprovalRequest) => Promise<boolean>) | undefined;
  logger: pino.Logger;
}

/**
 * 核心对话循环 generator。
 * 保证最后一个 yield 为 { type: "done" }。
 */
export async function* conversationLoop(ctx: LoopContext): AsyncGenerator<AgentEvent> {
  const { messages, config, logger } = ctx;
  const { provider, storage, registry, sessionId, systemPrompt, maxIterations } = config;

  // 1. 保存用户消息到 storage
  for (const msg of messages) {
    await storage.saveMessage(sessionId, msg);
  }

  // 2. 检索记忆（失败时 warn 并继续）
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  let memories: Awaited<ReturnType<typeof storage.recall>> = [];
  if (lastUserMessage) {
    try {
      memories = await storage.recall(
        typeof lastUserMessage.content === "string" ? lastUserMessage.content : "",
        5,
      );
    } catch (err) {
      logger.warn({ err }, "memory recall failed, continuing without memories");
    }
  }

  // 3. 加载历史
  const history = await storage.getHistory(sessionId);

  // 4. 构建初始 prompt
  let loopMessages = buildMessages(systemPrompt, memories, history, messages);

  // 5. 获取工具定义
  const toolDefinitions = registryToToolDefinitions(registry);

  // 6. 主循环（最多 maxIterations 轮）
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    // a. 带指数退避重试的 chatStream 调用（最多 3 次，间隔 1s/2s/4s）
    let stream: AsyncIterable<ChatChunk> | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        stream = provider.chatStream(loopMessages, { tools: toolDefinitions });
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          logger.warn({ attempt: attempt + 1, err }, "LLM call failed, retrying");
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    }

    // b. 全部重试失败时 yield 错误文本事件 + done 并 return
    if (lastError !== undefined) {
      const message = lastError instanceof Error ? lastError.message : String(lastError);
      logger.error({ err: lastError }, "LLM call failed after all retries");
      yield { type: "text", content: `Error: LLM call failed after retries. ${message}` };
      yield { type: "done" };
      return;
    }

    // c. 调用 aggregateStream 聚合响应，yield text 事件
    const gen = aggregateStream(stream!);
    let chunk = await gen.next();

    while (!chunk.done) {
      if (chunk.value.type === "text_delta") {
        yield { type: "text", content: chunk.value.content };
      }
      chunk = await gen.next();
    }

    const { content, toolCalls } = chunk.value;

    // d. 纯文本回复时保存 assistant 消息并 break
    if (toolCalls.length === 0) {
      if (content) {
        await storage.saveMessage(sessionId, { role: "assistant", content });
      }
      break;
    }

    // 保存 assistant 消息（含工具调用上下文）
    await storage.saveMessage(sessionId, { role: "assistant", content: content || "" });

    // 将 assistant 消息（含 toolCalls）追加到 loopMessages
    loopMessages = [
      ...loopMessages,
      { role: "assistant", content: content || "", toolCalls } as Message,
    ];

    // e. 工具调用时 yield tool_call 事件，调用 executeToolCall，yield tool_result 事件
    for (const toolCall of toolCalls) {
      let parsedParams: unknown;
      try {
        parsedParams = JSON.parse(toolCall.arguments || "{}");
      } catch {
        parsedParams = {};
      }

      yield { type: "tool_call", tool: toolCall.name, params: parsedParams };

      const { toolResult, rejected } = await executeToolCall(toolCall, {
        registry,
        storage,
        sessionId,
        setStatus: ctx.setStatus,
        onApprovalNeeded: ctx.onApprovalNeeded,
        logger,
      });

      yield { type: "tool_result", result: toolResult };

      // f. 将工具结果追加到 loopMessages 继续下一轮
      const toolMessage: Message = {
        role: "tool",
        toolCallId: toolCall.id,
        content: rejected
          ? `Tool "${toolCall.name}" was rejected by user`
          : toolResult.success
            ? JSON.stringify(toolResult.data)
            : toolResult.error,
      };

      await storage.saveMessage(sessionId, toolMessage);
      loopMessages = [...loopMessages, toolMessage];
    }
  }

  // 7. 循环结束后 yield { type: "done" }
  yield { type: "done" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
