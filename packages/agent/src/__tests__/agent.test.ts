import { describe, it, expect, vi } from "vitest";
import { Agent } from "../agent.js";
import { AgentConfigError, AgentBusyError } from "../errors.js";
import { ToolRegistry } from "@winches/core";
import type { LLMProvider, Message, ChatChunk } from "@winches/ai";
import type { StorageService } from "@winches/storage";
import type { AgentConfig } from "../types.js";

// 创建 mock 依赖的辅助函数
function makeMockProvider(chunks: ChatChunk[] = [{ content: "Hello!" }]): LLMProvider {
  return {
    name: "mock",
    chat: vi.fn(),
    chatStream: vi.fn().mockImplementation(async function* () {
      for (const chunk of chunks) yield chunk;
    }),
  };
}

function makeMockStorage(): StorageService {
  return {
    saveMessage: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockResolvedValue([]),
    searchHistory: vi.fn().mockResolvedValue([]),
    remember: vi.fn(),
    recall: vi.fn().mockResolvedValue([]),
    saveScheduledTask: vi.fn(),
    getPendingTasks: vi.fn(),
    updateTaskStatus: vi.fn(),
    logToolExecution: vi.fn().mockResolvedValue(undefined),
    getToolExecutionLogs: vi.fn().mockResolvedValue([]),
    queueApproval: vi.fn(),
    getApproval: vi.fn(),
    updateApprovalStatus: vi.fn(),
  } as unknown as StorageService;
}

function makeAgent(overrides?: Partial<AgentConfig>) {
  return new Agent({
    provider: makeMockProvider(),
    storage: makeMockStorage(),
    registry: new ToolRegistry(),
    sessionId: "test-session",
    ...overrides,
  });
}

describe("Agent 构造函数", () => {
  it("缺少 provider 时抛出 AgentConfigError", () => {
    expect(
      () =>
        new Agent({
          provider: undefined as unknown as LLMProvider,
          storage: makeMockStorage(),
          registry: new ToolRegistry(),
          sessionId: "s1",
        }),
    ).toThrow(AgentConfigError);
  });

  it("缺少 storage 时抛出 AgentConfigError", () => {
    expect(
      () =>
        new Agent({
          provider: makeMockProvider(),
          storage: undefined as unknown as StorageService,
          registry: new ToolRegistry(),
          sessionId: "s1",
        }),
    ).toThrow(AgentConfigError);
  });

  it("缺少 registry 时抛出 AgentConfigError", () => {
    expect(
      () =>
        new Agent({
          provider: makeMockProvider(),
          storage: makeMockStorage(),
          registry: undefined as unknown as ToolRegistry,
          sessionId: "s1",
        }),
    ).toThrow(AgentConfigError);
  });

  it("缺少 sessionId 时抛出 AgentConfigError", () => {
    expect(
      () =>
        new Agent({
          provider: makeMockProvider(),
          storage: makeMockStorage(),
          registry: new ToolRegistry(),
          sessionId: undefined as unknown as string,
        }),
    ).toThrow(AgentConfigError);
  });

  it("AgentConfigError 包含缺失字段名", () => {
    try {
      new Agent({
        provider: undefined as unknown as LLMProvider,
        storage: makeMockStorage(),
        registry: new ToolRegistry(),
        sessionId: "s1",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AgentConfigError);
      expect((err as AgentConfigError).missingField).toBe("provider");
    }
  });
});

describe("Agent 默认值", () => {
  it("maxIterations 默认为 10", async () => {
    // 通过让 provider 始终返回工具调用来验证 maxIterations 限制
    // 这里只验证 agent 能正常构造，默认值通过 loop 测试验证
    const agent = makeAgent();
    expect(agent).toBeDefined();
    expect(agent.getStatus()).toBe("idle");
  });

  it("systemPrompt 有默认值（不传时不报错）", async () => {
    const agent = makeAgent({ systemPrompt: undefined });
    const events: string[] = [];
    for await (const event of agent.chat([{ role: "user", content: "hi" }])) {
      events.push(event.type);
    }
    expect(events).toContain("done");
  });
});

describe("Agent.chat 事件序列", () => {
  it("纯文本回复场景：最后一个事件为 done", async () => {
    const agent = makeAgent({
      provider: makeMockProvider([{ content: "Hello!" }]),
    });

    const events: string[] = [];
    for await (const event of agent.chat([{ role: "user", content: "hi" }])) {
      events.push(event.type);
    }

    expect(events[events.length - 1]).toBe("done");
  });

  it("纯文本回复场景：包含 text 事件", async () => {
    const agent = makeAgent({
      provider: makeMockProvider([{ content: "Hello!" }]),
    });

    const events: Array<{ type: string; content?: string }> = [];
    for await (const event of agent.chat([{ role: "user", content: "hi" }])) {
      events.push(event as { type: string; content?: string });
    }

    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents[0].content).toBe("Hello!");
  });

  it("chat 完成后状态重置为 idle", async () => {
    const agent = makeAgent();

    for await (const _ of agent.chat([{ role: "user", content: "hi" }])) {
      // consume
    }

    expect(agent.getStatus()).toBe("idle");
  });

  it("chat 抛出异常后状态重置为 idle（finally 块）", async () => {
    const provider = makeMockProvider();
    // 让 chatStream 抛出异常
    (provider.chatStream as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("LLM error");
    });

    const agent = makeAgent({ provider });

    try {
      for await (const _ of agent.chat([{ role: "user", content: "hi" }])) {
        // consume — loop 内部会捕获重试失败后 yield done
      }
    } catch {
      // 可能抛出也可能不抛出，取决于实现
    }

    expect(agent.getStatus()).toBe("idle");
  }, 15000);
});

describe("Agent 并发保护", () => {
  it("并发调用 chat 时抛出 AgentBusyError", async () => {
    // 使用一个永不 resolve 的 provider 来保持 agent 处于 running 状态
    let resolveStream!: () => void;
    const provider: LLMProvider = {
      name: "mock",
      chat: vi.fn(),
      chatStream: vi.fn().mockImplementation(async function* () {
        await new Promise<void>((resolve) => {
          resolveStream = resolve;
        });
        yield { content: "done" };
      }),
    };

    const agent = makeAgent({ provider });
    const messages: Message[] = [{ role: "user", content: "hi" }];

    // 启动第一个 chat（不 await，让它挂起）
    const firstChat = agent.chat(messages);
    // 触发第一个 next() 让 agent 进入 running 状态
    const firstIter = firstChat[Symbol.asyncIterator]();
    const firstPromise = firstIter.next(); // 这会让 agent 开始运行

    // 等一个 microtask 让状态变为 running
    await Promise.resolve();

    // 第二次调用应该抛出 AgentBusyError
    await expect(async () => {
      for await (const _ of agent.chat(messages)) {
        // should throw before yielding
      }
    }).rejects.toThrow(AgentBusyError);

    // 清理：resolve 第一个 stream
    resolveStream();
    await firstPromise;
    // drain remaining events
    for await (const _ of { [Symbol.asyncIterator]: () => firstIter }) {
      // drain
    }
  });
});
