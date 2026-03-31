import type { Context } from "grammy";
import pino from "pino";
import type { GatewayConfig, ChatSession, PendingApproval } from "../types.js";
import type { ApprovalRequest } from "@winches/agent";
import type { ToolResult } from "@winches/core";
import { ThrottledBuffer } from "../throttle.js";
import { splitTelegramMessage, TELEGRAM_MAX_TEXT_LENGTH } from "../telegram-text.js";

const logger = pino({ name: "@winches/gateway/message" });

type ApprovalHandlerFactory = (
  ctx: Context,
  pendingApprovals: Map<string, PendingApproval>,
  config: GatewayConfig,
) => (request: ApprovalRequest) => Promise<boolean>;

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export function formatToolCallMessage(
  toolName: string,
  params: unknown,
  dangerLevel: string,
): string {
  const body = `🔧 调用工具：${toolName}\n参数：${truncate(JSON.stringify(params), 200)}`;
  return dangerLevel === "dangerous" ? `⚠️ ${body}` : body;
}

export async function sendToolCallMessage(
  ctx: Context,
  session: ChatSession,
  toolName: string,
  params: unknown,
  dangerLevel: string,
): Promise<void> {
  const text = formatToolCallMessage(toolName, params, dangerLevel);
  const msg = await ctx.reply(text);
  session.toolMessageMap.set(toolName, msg.message_id);
}

export async function updateToolCallMessage(
  ctx: Context,
  session: ChatSession,
  toolName: string,
  result: ToolResult,
  originalText: string,
): Promise<void> {
  const messageId = session.toolMessageMap.get(toolName);
  if (messageId == null) return;

  const suffix = result.success ? "\n✅ 完成" : `\n❌ 失败：${truncate(result.error, 200)}`;

  try {
    await ctx.api.editMessageText(session.chatId, messageId, originalText + suffix);
  } catch {
    // silent ignore
  }
}

export async function handleMessage(
  ctx: Context,
  session: ChatSession,
  pendingApprovals: Map<string, PendingApproval>,
  config: GatewayConfig,
  createApprovalHandler: ApprovalHandlerFactory,
): Promise<void> {
  // 1. Check if agent is busy
  if (session.agent.getStatus() !== "idle") {
    await ctx.reply("Agent 正在处理上一条消息，请稍候");
    return;
  }

  // 2. Get message text
  const text = ctx.message?.text;
  if (!text) return;

  // 3. Send placeholder message
  const placeholderMsg = await ctx.reply("思考中…");
  session.activeMessageId = placeholderMsg.message_id;
  let finalContent = "";

  // 4. Create ThrottledBuffer
  const editFn = async (content: string): Promise<void> => {
    const preview = content.length > TELEGRAM_MAX_TEXT_LENGTH
      ? splitTelegramMessage(content, TELEGRAM_MAX_TEXT_LENGTH)[0]
      : content;
    await ctx.api.editMessageText(ctx.chat!.id, session.activeMessageId!, preview);
  };
  const buffer = new ThrottledBuffer(editFn);
  buffer.start();

  // 5. Register approval handler
  session.agent.onApprovalNeeded = createApprovalHandler(ctx, pendingApprovals, config);

  // Track last tool name and its formatted message text for tool_result correlation
  let lastToolName: string | null = null;
  let lastToolText: string | null = null;

  try {
    // 6. Process agent event stream
    logger.info("[message] starting agent event stream");
    for await (const event of session.agent.chat([{ role: "user", content: text }])) {
      logger.info({ eventType: event.type }, "[message] received agent event");
      switch (event.type) {
        case "text":
          finalContent += event.content;
          buffer.append(event.content);
          break;
        case "tool_call":
          logger.info({ tool: event.tool, params: event.params }, "[message] tool_call event");
          lastToolName = event.tool;
          lastToolText = formatToolCallMessage(event.tool, event.params, "safe");
          await sendToolCallMessage(ctx, session, event.tool, event.params, "safe");
          break;
        case "tool_result":
          logger.info({ success: event.result.success }, "[message] tool_result event");
          if (lastToolName != null && lastToolText != null) {
            await updateToolCallMessage(ctx, session, lastToolName, event.result, lastToolText);
          }
          break;
        case "done":
          logger.info("[message] done event, flushing buffer");
          await buffer.flush();
          break;
      }
    }
    logger.info("[message] agent event stream ended");
  } catch (err) {
    buffer.stop();
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg }, "[message] error in agent event stream");
    await ctx.reply(`❌ 发生错误：${errMsg}`).catch(() => {});
  } finally {
    if (session.activeMessageId != null && finalContent.trim().length > 0) {
      const chunks = splitTelegramMessage(finalContent, TELEGRAM_MAX_TEXT_LENGTH);
      try {
        await ctx.api.editMessageText(ctx.chat!.id, session.activeMessageId, chunks[0]!);
        for (const chunk of chunks.slice(1)) {
          await ctx.reply(chunk);
        }
      } catch (err) {
        logger.warn({ err }, "[message] final edit failed, sending fallback reply");
        for (const chunk of chunks) {
          await ctx.reply(chunk).catch(() => {});
        }
      }
    }
    session.agent.onApprovalNeeded = undefined;
    session.activeMessageId = undefined;
  }
}
