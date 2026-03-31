import { describe, expect, it, vi } from "vitest";
import { handleMessage } from "../handlers/message.js";
import type { ChatSession, GatewayConfig, PendingApproval } from "../types.js";
import { TELEGRAM_MAX_TEXT_LENGTH } from "../telegram-text.js";

function makeConfig(): GatewayConfig {
  return {
    llm: { provider: "openai", model: "test", apiKey: "test" },
    embedding: { provider: "local", model: "test" },
    telegram: { botToken: "test" },
    approval: { timeout: 300, defaultAction: "reject" },
    storage: { dbPath: ":memory:" },
    logging: { level: "info" },
  };
}

function makeSession(): ChatSession {
  return {
    chatId: 123,
    sessionId: "telegram-123-1",
    activeMessageId: undefined,
    toolMessageMap: new Map(),
    agent: {
      getStatus: vi.fn().mockReturnValue("idle"),
      chat: vi.fn().mockImplementation(async function* () {
        yield { type: "text", content: "Available commands:\n/skills" };
        yield { type: "done" };
      }),
      onApprovalNeeded: undefined,
    },
  } as unknown as ChatSession;
}

describe("handleMessage", () => {
  it("占位消息编辑失败时，会回退发送最终文本", async () => {
    const reply = vi
      .fn()
      .mockResolvedValueOnce({ message_id: 1 })
      .mockResolvedValueOnce({ message_id: 2 });

    const ctx = {
      chat: { id: 123 },
      message: { text: "/skills" },
      reply,
      api: {
        editMessageText: vi.fn().mockRejectedValue(new Error("message is not modified")),
      },
    };

    const session = makeSession();
    const pendingApprovals = new Map<string, PendingApproval>();
    const createApprovalHandler = vi.fn().mockReturnValue(vi.fn());

    await handleMessage(
      ctx as never,
      session,
      pendingApprovals,
      makeConfig(),
      createApprovalHandler,
    );

    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply).toHaveBeenLastCalledWith("Available commands:\n/skills");
  });

  it("超长最终文本会拆分成多条 Telegram 消息", async () => {
    const longText = `${"/skill — description\n".repeat(260)}END`;
    const reply = vi
      .fn()
      .mockResolvedValueOnce({ message_id: 1 })
      .mockResolvedValue({ message_id: 2 });

    const ctx = {
      chat: { id: 123 },
      message: { text: "/skills" },
      reply,
      api: {
        editMessageText: vi.fn().mockResolvedValue(undefined),
      },
    };

    const session = makeSession();
    session.agent = {
      getStatus: vi.fn().mockReturnValue("idle"),
      chat: vi.fn().mockImplementation(async function* () {
        yield { type: "text", content: longText };
        yield { type: "done" };
      }),
      onApprovalNeeded: undefined,
    } as never;

    await handleMessage(
      ctx as never,
      session,
      new Map<string, PendingApproval>(),
      makeConfig(),
      vi.fn().mockReturnValue(vi.fn()),
    );

    const editedText = vi.mocked(ctx.api.editMessageText).mock.calls[0]?.[2] as string;
    expect(editedText.length).toBeLessThanOrEqual(TELEGRAM_MAX_TEXT_LENGTH);
    expect(reply.mock.calls.length).toBeGreaterThan(1);
  });
});
