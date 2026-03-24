import type { Context } from "grammy";
import type { SessionManager } from "../session.js";

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(
    `🤖 *Winches Agent Bot — 您的 7×24 小时 AI 助手*\n\n` +
      `可用命令：\n` +
      `/start — 显示此帮助信息\n` +
      `/new — 开启新会话\n` +
      `/status — 查看当前状态`,
    { parse_mode: "Markdown" },
  );
}

export async function handleNew(
  ctx: Context,
  sessionManager: SessionManager,
  chatId: number,
): Promise<void> {
  sessionManager.reset(chatId);
  await ctx.reply("已开启新会话 ✨");
}

export async function handleStatus(
  ctx: Context,
  sessionManager: SessionManager,
  chatId: number,
): Promise<void> {
  const session = sessionManager.getOrCreate(chatId);
  const rawStatus = session.agent.getStatus();
  const statusMap: Record<string, string> = {
    idle: "空闲 ✅",
    running: "处理中 ⏳",
    waiting_approval: "等待审批 🔐",
  };
  const status = statusMap[rawStatus] ?? rawStatus;
  await ctx.reply(`📊 当前状态\n会话 ID：${session.sessionId}\nAgent 状态：${status}`);
}
