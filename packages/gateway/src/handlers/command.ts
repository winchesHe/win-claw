import type { Context } from "grammy";
import type { SessionManager } from "../session.js";

export async function handleStart(ctx: Context): Promise<void> {
  await ctx.reply(
    `🤖 *Winches Agent Bot — 您的 7×24 小时 AI 助手*\n\n` +
      `可用命令：\n` +
      `/start — 显示此帮助信息\n` +
      `/new — 开启新会话\n` +
      `/status — 查看当前状态\n` +
      `/session — 查看当前会话 ID\n` +
      `/sessions — 查看历史会话\n` +
      `/switch <id> — 切换到指定会话`,
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

export async function handleSession(
  ctx: Context,
  sessionManager: SessionManager,
  chatId: number,
): Promise<void> {
  const session = sessionManager.getOrCreate(chatId);
  await ctx.reply(`当前会话 ID：${session.sessionId}`);
}

export async function handleSessions(ctx: Context, sessionManager: SessionManager): Promise<void> {
  try {
    const currentSession = sessionManager.getOrCreate(ctx.chat!.id);
    const sessions = await sessionManager.listSessions(20);
    if (sessions.length === 0) {
      await ctx.reply("暂无历史会话。");
      return;
    }

    const lines = sessions.map((session) => {
      const isCurrent = session.sessionId === currentSession.sessionId ? " ← 当前" : "";
      return `${session.sessionId} (${session.messageCount} 条消息, ${session.lastActiveAt.toLocaleString()})${isCurrent}`;
    });

    await ctx.reply(`历史会话：\n${lines.join("\n")}`);
  } catch {
    await ctx.reply("获取会话列表失败。");
  }
}

export async function handleSwitch(
  ctx: Context,
  sessionManager: SessionManager,
  chatId: number,
): Promise<void> {
  const text = ctx.message?.text ?? "";
  const targetId = text.split(/\s+/, 2)[1]?.trim();
  if (!targetId) {
    await ctx.reply("用法：/switch <sessionId>");
    return;
  }

  try {
    const switched = await sessionManager.switchSession(chatId, targetId);
    if (!switched) {
      await ctx.reply("会话不存在");
      return;
    }
    await ctx.reply(`已切换到会话：${targetId}`);
  } catch {
    await ctx.reply("切换会话失败，请检查会话 ID。");
  }
}
