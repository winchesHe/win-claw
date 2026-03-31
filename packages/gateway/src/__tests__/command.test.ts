import { describe, expect, it, vi } from "vitest";
import {
  handleSession,
  handleSessions,
  handleSwitch,
} from "../handlers/command.js";

describe("gateway session commands", () => {
  it("/session 返回当前会话 ID", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const sessionManager = {
      getOrCreate: vi.fn().mockReturnValue({ sessionId: "telegram-1-100" }),
    };

    await handleSession({ reply } as never, sessionManager as never, 1);

    expect(reply).toHaveBeenCalledWith("当前会话 ID：telegram-1-100");
  });

  it("/sessions 返回历史会话列表", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const sessionManager = {
      getOrCreate: vi.fn().mockReturnValue({ sessionId: "telegram-1-100" }),
      listSessions: vi.fn().mockResolvedValue([
        {
          sessionId: "telegram-1-100",
          messageCount: 3,
          lastActiveAt: new Date("2026-03-31T11:00:00+08:00"),
        },
        {
          sessionId: "telegram-1-99",
          messageCount: 5,
          lastActiveAt: new Date("2026-03-31T10:00:00+08:00"),
        },
      ]),
    };

    await handleSessions({ chat: { id: 1 }, reply } as never, sessionManager as never);

    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0]?.[0]).toContain("历史会话：");
    expect(reply.mock.calls[0]?.[0]).toContain("telegram-1-100");
    expect(reply.mock.calls[0]?.[0]).toContain("← 当前");
  });

  it("/switch 缺少参数时返回用法", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    await handleSwitch({ message: { text: "/switch" }, reply } as never, {} as never, 1);

    expect(reply).toHaveBeenCalledWith("用法：/switch <sessionId>");
  });

  it("/switch 成功切换会话", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const sessionManager = {
      switchSession: vi.fn().mockResolvedValue(true),
    };

    await handleSwitch(
      { message: { text: "/switch telegram-1-99" }, reply } as never,
      sessionManager as never,
      1,
    );

    expect(sessionManager.switchSession).toHaveBeenCalledWith(1, "telegram-1-99");
    expect(reply).toHaveBeenCalledWith("已切换到会话：telegram-1-99");
  });
});
