import { Bot } from "grammy";
import pino from "pino";
import type { LLMProvider } from "@winches/ai";
import type { StorageService } from "@winches/storage";
import type { IToolRegistry, ISkillRegistry, IMcpClientManager } from "@winches/core";
import type { GatewayConfig, PendingApproval } from "./types.js";
import { SessionManager } from "./session.js";
import { handleMessage } from "./handlers/message.js";
import { handleStart, handleNew, handleStatus } from "./handlers/command.js";
import { createApprovalHandler, handleCallbackQuery } from "./handlers/callback.js";

export class GatewayBot {
  private bot: Bot;
  private sessionManager: SessionManager;
  private pendingApprovals: Map<string, PendingApproval>;
  private logger: pino.Logger;
  private isShuttingDown: boolean = false;

  constructor(
    private config: GatewayConfig,
    provider: LLMProvider,
    storage: StorageService,
    registry: IToolRegistry,
    skillRegistry?: ISkillRegistry,
    mcpClientManager?: IMcpClientManager,
  ) {
    this.bot = new Bot(config.telegram.botToken);
    this.sessionManager = new SessionManager(
      provider,
      storage,
      registry,
      skillRegistry,
      mcpClientManager,
    );
    this.pendingApprovals = new Map();
    this.logger = pino({ name: "@winches/gateway" });
  }

  async start(): Promise<void> {
    // Register command handlers
    this.bot.command("start", (ctx) => handleStart(ctx));
    this.bot.command("new", (ctx) => handleNew(ctx, this.sessionManager, ctx.chat.id));
    this.bot.command("status", (ctx) => handleStatus(ctx, this.sessionManager, ctx.chat.id));

    // Register text message handler (non-command text messages)
    this.bot.on("message:text", async (ctx) => {
      if (ctx.message.text.startsWith("/")) return; // commands handled above
      const session = this.sessionManager.getOrCreate(ctx.chat.id);
      // Do NOT await — let grammy continue processing other updates (e.g. callback_query for approvals)
      handleMessage(ctx, session, this.pendingApprovals, this.config, createApprovalHandler).catch(
        (err) => this.logger.error({ err }, "handleMessage unhandled error"),
      );
    });

    // Register non-text message handler
    this.bot.on("message", async (ctx) => {
      if (!ctx.message?.text) {
        await ctx.reply("暂不支持该消息类型，请发送文字消息");
      }
    });

    // Register callback_query handler
    this.bot.on("callback_query:data", async (ctx) => {
      await handleCallbackQuery(ctx, this.pendingApprovals);
    });

    // Register error handler
    this.bot.catch((err) => {
      this.logger.error({ err }, "grammy error");
    });

    // Start polling (long-running, do not await)
    void this.bot.start({
      onStart: (botInfo) => {
        this.logger.info({ username: botInfo.username }, "Bot started");
      },
    });

    // Register process signal handlers
    const shutdown = async () => {
      await this.shutdown(30_000);
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("uncaughtException", (err) => {
      this.logger.fatal({ err }, "uncaughtException");
      process.exit(1);
    });
    process.on("unhandledRejection", (err) => {
      this.logger.fatal({ err }, "unhandledRejection");
      process.exit(1);
    });
  }

  async shutdown(timeoutMs: number = 30_000): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.logger.info("shutting down...");

    // Stop polling
    await this.bot.stop().catch(() => {});

    // Reject all pending approvals
    for (const [, pending] of this.pendingApprovals) {
      if (!pending.settled) {
        pending.settled = true;
        clearTimeout(pending.timer);
        this.bot.api
          .editMessageText(pending.chatId, pending.messageId, "Bot 正在关闭，审批请求已自动拒绝 🔒")
          .catch(() => {});
        pending.resolve(false);
      }
    }
    this.pendingApprovals.clear();

    // Wait for active agent requests to complete (up to timeoutMs)
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hasActive = this.sessionManager.all().some((s) => s.agent.getStatus() !== "idle");
      if (!hasActive) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    this.logger.info("shutdown complete");
  }
}
