import type { ChatChunk, ToolCall } from "@winches/ai";

/** 聚合后的完整 LLM 响应 */
export interface AggregatedResponse {
  content: string;
  toolCalls: ToolCall[];
}

/**
 * 将 ChatChunk 流聚合为完整响应，同时 yield 文本增量事件。
 *
 * - 文本内容：每个 chunk.content 直接 yield，同时累积到 content 字符串
 * - 工具调用：按 index 分组累积，流结束后提取完整 ToolCall
 *   - chunk.toolCalls[i].id 出现时初始化该 index 的累积对象
 *   - chunk.toolCalls[i].arguments 追加到对应 index 的 arguments 字符串
 *   - chunk.toolCalls[i].name 出现时设置工具名称
 * - 通过 generator return value 返回最终 AggregatedResponse
 */
export async function* aggregateStream(
  stream: AsyncIterable<ChatChunk>,
): AsyncGenerator<{ type: "text_delta"; content: string }, AggregatedResponse> {
  let content = "";
  const toolCallAccumulators = new Map<number, { id?: string; name?: string; arguments: string }>();

  for await (const chunk of stream) {
    if (chunk.content) {
      content += chunk.content;
      yield { type: "text_delta", content: chunk.content };
    }

    if (chunk.toolCalls) {
      for (let i = 0; i < chunk.toolCalls.length; i++) {
        const partial = chunk.toolCalls[i];
        const key = partial.index ?? i;
        if (!toolCallAccumulators.has(key)) {
          toolCallAccumulators.set(key, { arguments: "" });
        }
        const acc = toolCallAccumulators.get(key)!;
        if (partial.id) acc.id = partial.id;
        if (partial.name) acc.name = partial.name;
        if (partial.arguments) acc.arguments += partial.arguments;
      }
    }
  }

  const toolCalls: ToolCall[] = [];
  for (const [, acc] of toolCallAccumulators) {
    if (acc.id && acc.name) {
      toolCalls.push({ id: acc.id, name: acc.name, arguments: acc.arguments });
    }
  }

  return { content, toolCalls };
}
