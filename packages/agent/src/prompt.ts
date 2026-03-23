import type { Message } from "@winches/ai";
import type { Memory } from "@winches/storage";

/**
 * 构建发送给 LLM 的完整消息列表。
 *
 * 消息顺序：
 * 1. system 消息（systemPrompt + 可选记忆区块）
 * 2. 历史消息（来自 storage.getHistory）
 * 3. 当前用户消息（本次 chat 传入的 messages）
 *
 * 记忆注入格式（memories 非空时）：
 * <memory>
 * 记忆内容1
 * 记忆内容2
 * </memory>
 */
export function buildMessages(
  systemPrompt: string,
  memories: Memory[],
  history: Message[],
  currentMessages: Message[],
): Message[] {
  let systemContent = systemPrompt;

  if (memories.length > 0) {
    const memoryLines = memories.map((m) => m.content).join("\n");
    systemContent += `\n\n<memory>\n${memoryLines}\n</memory>`;
  }

  const systemMessage: Message = {
    role: "system",
    content: systemContent,
  };

  return [systemMessage, ...history, ...currentMessages];
}
