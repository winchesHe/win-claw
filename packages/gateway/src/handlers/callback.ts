import { InlineKeyboard } from "grammy";
import pino from "pino";
import type { Context } from "grammy";
import type { GatewayConfig, PendingApproval } from "../types.js";
import type { ApprovalRequest } from "@winches/agent";

const logger = pino({ name: "@winches/gateway/callback" });

export function createApprovalHandler(
  ctx: Context,
  pendingApprovals: Map<string, PendingApproval>,
  config: GatewayConfig,
): (request: ApprovalRequest) => Promise<boolean> {
  return async (request: ApprovalRequest): Promise<boolean> => {
    const approvalId = crypto.randomUUID();
    logger.info(
      { approvalId, toolName: request.toolName, dangerLevel: request.dangerLevel },
      "[approval] creating approval request",
    );
    const messageText = `🔐 需要审批\n工具：${request.toolName}\n危险等级：${request.dangerLevel}\n参数：${JSON.stringify(request.params, null, 2).slice(0, 300)}`;

    const msg = await ctx.reply(messageText, {
      reply_markup: new InlineKeyboard()
        .text("✅ 批准", `approve:${approvalId}`)
        .text("❌ 拒绝", `reject:${approvalId}`),
    });
    logger.info(
      { approvalId, messageId: msg.message_id },
      "[approval] sent approval message to Telegram, waiting for user response",
    );

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const pending = pendingApprovals.get(approvalId);
        if (pending && pending.settled === false) {
          pending.settled = true;
          pendingApprovals.delete(approvalId);
          const approved = config.approval.defaultAction === "approve";
          logger.info({ approvalId, approved }, "[approval] timed out, auto-resolving");
          ctx.api
            .editMessageText(
              ctx.chat!.id,
              msg.message_id,
              `已超时自动${approved ? "批准" : "拒绝"} ⏱️`,
            )
            .catch(() => {});
          resolve(approved);
        }
      }, config.approval.timeout * 1000);

      pendingApprovals.set(approvalId, {
        approvalId,
        chatId: ctx.chat!.id,
        messageId: msg.message_id,
        resolve,
        timer,
        settled: false,
      });
      logger.info(
        { approvalId, pendingCount: pendingApprovals.size },
        "[approval] registered in pendingApprovals map",
      );
    });
  };
}

export async function handleCallbackQuery(
  ctx: Context,
  pendingApprovals: Map<string, PendingApproval>,
): Promise<void> {
  const data = ctx.callbackQuery?.data;
  logger.info({ data, pendingCount: pendingApprovals.size }, "[callback] received callback query");

  if (!data) {
    logger.warn("[callback] no data in callback query");
    await ctx.answerCallbackQuery();
    return;
  }

  const match = data.match(/^(approve|reject):(.+)$/);
  if (!match) {
    logger.warn({ data }, "[callback] data does not match approve/reject pattern");
    await ctx.answerCallbackQuery();
    return;
  }

  const action = match[1] as "approve" | "reject";
  const approvalId = match[2];

  const pending = pendingApprovals.get(approvalId);
  logger.info(
    {
      action,
      approvalId,
      found: !!pending,
      settled: pending?.settled,
      pendingKeys: [...pendingApprovals.keys()],
    },
    "[callback] looking up pending approval",
  );

  if (!pending || pending.settled) {
    logger.warn(
      { approvalId, found: !!pending, settled: pending?.settled },
      "[callback] approval not found or already settled",
    );
    await ctx.answerCallbackQuery("该审批请求已超时");
    return;
  }

  pending.settled = true;
  clearTimeout(pending.timer);
  pendingApprovals.delete(approvalId);

  const approved = action === "approve";
  logger.info({ approvalId, approved }, "[callback] resolving approval promise");
  pending.resolve(approved);
  logger.info({ approvalId }, "[callback] approval promise resolved");

  await ctx.api
    .editMessageText(pending.chatId, pending.messageId, approved ? "已批准 ✅" : "已拒绝 ❌")
    .catch((err) => {
      logger.error({ err, approvalId }, "[callback] failed to edit approval message");
    });

  await ctx.answerCallbackQuery();
  logger.info({ approvalId }, "[callback] callback query answered, done");
}
