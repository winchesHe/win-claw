import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import type { GatewayConfig, PendingApproval } from "../types.js";
import type { ApprovalRequest } from "@winches/agent";

export function createApprovalHandler(
  ctx: Context,
  pendingApprovals: Map<string, PendingApproval>,
  config: GatewayConfig,
): (request: ApprovalRequest) => Promise<boolean> {
  return async (request: ApprovalRequest): Promise<boolean> => {
    const approvalId = crypto.randomUUID();
    const messageText = `🔐 需要审批\n工具：${request.toolName}\n危险等级：${request.dangerLevel}\n参数：${JSON.stringify(request.params, null, 2).slice(0, 300)}`;

    const msg = await ctx.reply(messageText, {
      reply_markup: new InlineKeyboard()
        .text("✅ 批准", `approve:${approvalId}`)
        .text("❌ 拒绝", `reject:${approvalId}`),
    });

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const pending = pendingApprovals.get(approvalId);
        if (pending && pending.settled === false) {
          pending.settled = true;
          pendingApprovals.delete(approvalId);
          const approved = config.approval.defaultAction === "approve";
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
    });
  };
}

export async function handleCallbackQuery(
  ctx: Context,
  pendingApprovals: Map<string, PendingApproval>,
): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    await ctx.answerCallbackQuery();
    return;
  }

  const match = data.match(/^(approve|reject):(.+)$/);
  if (!match) {
    await ctx.answerCallbackQuery();
    return;
  }

  const action = match[1] as "approve" | "reject";
  const approvalId = match[2];

  const pending = pendingApprovals.get(approvalId);
  if (!pending || pending.settled) {
    await ctx.answerCallbackQuery("该审批请求已超时");
    return;
  }

  pending.settled = true;
  clearTimeout(pending.timer);
  pendingApprovals.delete(approvalId);

  const approved = action === "approve";
  pending.resolve(approved);

  await ctx.api
    .editMessageText(
      pending.chatId,
      pending.messageId,
      approved ? "已批准 ✅" : "已拒绝 ❌",
    )
    .catch(() => {});

  await ctx.answerCallbackQuery();
}
