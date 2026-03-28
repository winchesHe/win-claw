import { describe, it, expect } from "vitest";
import { aggregateStream } from "../stream.js";
import type { ChatChunk } from "@winches/ai";

async function* makeStream(chunks: ChatChunk[]): AsyncIterable<ChatChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function consumeStream(stream: AsyncIterable<ChatChunk>) {
  const gen = aggregateStream(stream);
  const textDeltas: string[] = [];
  let result = await gen.next();
  while (!result.done) {
    textDeltas.push(result.value.content);
    result = await gen.next();
  }
  return { textDeltas, aggregated: result.value };
}

describe("aggregateStream", () => {
  it("纯文本流：yield 文本增量，return 完整 content", async () => {
    const chunks: ChatChunk[] = [{ content: "Hello" }, { content: ", " }, { content: "world!" }];
    const { textDeltas, aggregated } = await consumeStream(makeStream(chunks));

    expect(textDeltas).toEqual(["Hello", ", ", "world!"]);
    expect(aggregated.content).toBe("Hello, world!");
    expect(aggregated.toolCalls).toEqual([]);
  });

  it("工具调用流：多 chunk 拼接 arguments", async () => {
    const chunks: ChatChunk[] = [
      { toolCalls: [{ id: "call-1", name: "file.read", arguments: '{"pa' }] },
      { toolCalls: [{ id: undefined, name: undefined, arguments: 'th": "/tmp"}' }] },
    ];
    const { textDeltas, aggregated } = await consumeStream(makeStream(chunks));

    expect(textDeltas).toEqual([]);
    expect(aggregated.content).toBe("");
    expect(aggregated.toolCalls).toHaveLength(1);
    expect(aggregated.toolCalls[0]).toEqual({
      id: "call-1",
      name: "file.read",
      arguments: '{"path": "/tmp"}',
    });
  });

  it("混合响应：文本 + 工具调用同时存在", async () => {
    const chunks: ChatChunk[] = [
      { content: "正在读取文件" },
      { toolCalls: [{ id: "call-2", name: "file.read", arguments: '{"path":' }] },
      { toolCalls: [{ arguments: '"/etc/hosts"}' }] },
    ];
    const { textDeltas, aggregated } = await consumeStream(makeStream(chunks));

    expect(textDeltas).toEqual(["正在读取文件"]);
    expect(aggregated.content).toBe("正在读取文件");
    expect(aggregated.toolCalls).toHaveLength(1);
    expect(aggregated.toolCalls[0].name).toBe("file.read");
    expect(aggregated.toolCalls[0].arguments).toBe('{"path":"/etc/hosts"}');
  });

  it("空流：返回空 content 和空 toolCalls", async () => {
    const { textDeltas, aggregated } = await consumeStream(makeStream([]));

    expect(textDeltas).toEqual([]);
    expect(aggregated.content).toBe("");
    expect(aggregated.toolCalls).toEqual([]);
  });

  it("多个工具调用按 index 分组", async () => {
    const chunks: ChatChunk[] = [
      {
        toolCalls: [
          { id: "call-a", name: "tool.a", arguments: '{"x":1}' },
          { id: "call-b", name: "tool.b", arguments: '{"y":2}' },
        ],
      },
    ];
    const { aggregated } = await consumeStream(makeStream(chunks));

    expect(aggregated.toolCalls).toHaveLength(2);
    expect(aggregated.toolCalls[0].id).toBe("call-a");
    expect(aggregated.toolCalls[1].id).toBe("call-b");
  });
});
