import { describe, expect, it } from "vitest";
import { splitTelegramMessage, TELEGRAM_MAX_TEXT_LENGTH } from "../telegram-text.js";

describe("splitTelegramMessage", () => {
  it("短文本不拆分", () => {
    expect(splitTelegramMessage("hello")).toEqual(["hello"]);
  });

  it("超长文本会被拆成多个不超过 Telegram 上限的分片", () => {
    const text = `${"line\n".repeat(1200)}tail`;
    const chunks = splitTelegramMessage(text, TELEGRAM_MAX_TEXT_LENGTH);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= TELEGRAM_MAX_TEXT_LENGTH)).toBe(true);
    expect(chunks.join("\n").replace(/\n+/g, "\n")).toContain("tail");
  });
});
