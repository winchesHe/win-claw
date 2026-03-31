import { describe, expect, it } from "vitest";
import { shouldHandleAsTelegramCommand } from "../bot.js";

describe("shouldHandleAsTelegramCommand", () => {
  it("只将 Gateway 原生支持的 Telegram 命令交给 grammy", () => {
    expect(shouldHandleAsTelegramCommand("/start")).toBe(true);
    expect(shouldHandleAsTelegramCommand("/new")).toBe(true);
    expect(shouldHandleAsTelegramCommand("/status")).toBe(true);
    expect(shouldHandleAsTelegramCommand("/start@winches_bot")).toBe(true);
  });

  it("将 agent slash commands 继续交给 Agent 层处理", () => {
    expect(shouldHandleAsTelegramCommand("/skills")).toBe(false);
    expect(shouldHandleAsTelegramCommand("/mcp-status")).toBe(false);
    expect(shouldHandleAsTelegramCommand("/systematic-debugging gateway 调用 skill 不生效")).toBe(
      false,
    );
  });
});
