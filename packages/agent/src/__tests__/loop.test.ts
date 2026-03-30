import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { ToolRegistry } from "@winches/core";
import { conversationLoop } from "../loop.js";
import type { LoopContext } from "../loop.js";
import type { LLMProvider, ChatChunk } from "@winches/ai";
import type { StorageService } from "@winches/storage";
import type { ResolvedAgentConfig } from "../types.js";
import type { Tool } from "@winches/core";
import type { ISkillRegistry, IMcpClientManager } from "@winches/core";

const logger = pino({ level: "silent" });

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

function makeMockProvider(chunks: ChatChunk[] = [{ content: "Hello!" }]): LLMProvider {
  return {
    name: "mock",
    chat: vi.fn(),
    chatStream: vi.fn().mockImplementation(async function* () {
      for (const chunk of chunks) yield chunk;
    }),
  };
}

function makeConfig(
  provider: LLMProvider,
  registry: ToolRegistry = new ToolRegistry(),
  overrides: Partial<ResolvedAgentConfig> = {},
): ResolvedAgentConfig {
  return {
    provider,
    storage: makeMockStorage(),
    registry,
    sessionId: "test-session",
    systemPrompt: "You are a helpful assistant.",
    maxIterations: 10,
    ...overrides,
  };
}

function makeCtx(
  provider: LLMProvider,
  registry: ToolRegistry = new ToolRegistry(),
  overrides: Partial<LoopContext> = {},
): LoopContext {
  return {
    messages: [{ role: "user", content: "hello" }],
    config: makeConfig(provider, registry),
    getStatus: () => "running",
    setStatus: vi.fn(),
    onApprovalNeeded: undefined,
    logger,
    ...overrides,
  };
}

async function collectEvents(ctx: LoopContext) {
  const events = [];
  for await (const event of conversationLoop(ctx)) {
    events.push(event);
  }
  return events;
}

describe("conversationLoop — 纯文本回复", () => {
  it("yield text 事件 + done", async () => {
    const provider = makeMockProvider([{ content: "Hello!" }]);
    const ctx = makeCtx(provider);
    const events = await collectEvents(ctx);

    const types = events.map((e) => e.type);
    expect(types).toContain("text");
    expect(types[types.length - 1]).toBe("done");
  });

  it("text 事件内容正确", async () => {
    const provider = makeMockProvider([{ content: "Hi there" }]);
    const ctx = makeCtx(provider);
    const events = await collectEvents(ctx);

    const textEvents = events.filter((e) => e.type === "text");
    expect(textEvents.length).toBeGreaterThan(0);
    const combined = textEvents
      .map((e) => (e as { type: "text"; content: string }).content)
      .join("");
    expect(combined).toBe("Hi there");
  });
});

describe("conversationLoop — slash skill", () => {
  it("skill slash command 只注入一次，不会递归导致栈溢出", async () => {
    const provider = makeMockProvider([{ content: "Generated AGENTS.md guidance" }]);

    const skillRegistry: ISkillRegistry = {
      get: vi.fn().mockReturnValue({
        name: "create-agentsmd",
        description: "Create an AGENTS.md file",
        prompt: "You are helping create AGENTS.md.",
        source: { ideType: "codex", path: "/tmp/skill/SKILL.md", scope: "global" },
      }),
      list: vi.fn().mockReturnValue([]),
      renderContent: vi.fn(),
      renderPrompt: vi.fn(),
      loadAll: vi.fn().mockResolvedValue(undefined),
    };

    const mcpClientManager: IMcpClientManager = {
      getStatus: vi.fn().mockReturnValue([]),
      connectAll: vi.fn().mockResolvedValue(undefined),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
    };

    const ctx: LoopContext = {
      messages: [{ role: "user", content: "/create-agentsmd" }],
      config: makeConfig(provider, new ToolRegistry(), {
        skillRegistry,
        mcpClientManager,
      }),
      getStatus: () => "running",
      setStatus: vi.fn(),
      onApprovalNeeded: undefined,
      logger,
    };

    const events = await collectEvents(ctx);

    expect(events[events.length - 1]?.type).toBe("done");
    expect(provider.chatStream).toHaveBeenCalledTimes(1);
    expect(skillRegistry.renderPrompt).not.toHaveBeenCalled();

    const systemMessage = vi
      .mocked(provider.chatStream)
      .mock.calls[0]?.[0]?.find((message) => message.role === "system")?.content;

    expect(systemMessage).toContain("The user explicitly selected the skill `create-agentsmd`.");
    expect(systemMessage).toContain(
      "Read the skill document at `/tmp/skill/SKILL.md` with `file-read`",
    );
    expect(systemMessage).not.toContain("You are helping create AGENTS.md.");
  });

  it("无额外参数的 skill slash command 也会向 provider 发送一个 user message", async () => {
    const provider = makeMockProvider([{ content: "Generated AGENTS.md guidance" }]);

    const skillRegistry: ISkillRegistry = {
      get: vi.fn().mockReturnValue({
        name: "create-agentsmd",
        description: "Create an AGENTS.md file",
        prompt: "You are helping create AGENTS.md.",
        source: { ideType: "codex", path: "/tmp/skill/SKILL.md", scope: "global" },
      }),
      list: vi.fn().mockReturnValue([]),
      renderContent: vi.fn(),
      renderPrompt: vi.fn(),
      loadAll: vi.fn().mockResolvedValue(undefined),
    };

    const mcpClientManager: IMcpClientManager = {
      getStatus: vi.fn().mockReturnValue([]),
      connectAll: vi.fn().mockResolvedValue(undefined),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
    };

    const ctx: LoopContext = {
      messages: [{ role: "user", content: "/create-agentsmd" }],
      config: makeConfig(provider, new ToolRegistry(), {
        skillRegistry,
        mcpClientManager,
      }),
      getStatus: () => "running",
      setStatus: vi.fn(),
      onApprovalNeeded: undefined,
      logger,
    };

    await collectEvents(ctx);

    const firstCallArgs = vi.mocked(provider.chatStream).mock.calls[0]?.[0];
    const nonSystemMessages = firstCallArgs?.filter((message) => message.role !== "system") ?? [];

    expect(nonSystemMessages).toHaveLength(1);
    expect(nonSystemMessages[0]).toMatchObject({
      role: "user",
      content: "Use the create-agentsmd skill for this request.",
    });
  });
});

describe("conversationLoop — 工具调用场景", () => {
  it("yield tool_call + tool_result + done（使用 safe 工具）", async () => {
    const safeTool: Tool = {
      name: "test.safe",
      description: "safe test tool",
      parameters: {},
      dangerLevel: "safe",
      execute: vi.fn().mockResolvedValue({ success: true, data: "result" }),
    };

    const registry = new ToolRegistry();
    registry.register(safeTool);

    // 第一次调用返回工具调用，第二次返回纯文本（结束循环）
    let callCount = 0;
    const provider: LLMProvider = {
      name: "mock",
      chat: vi.fn(),
      chatStream: vi.fn().mockImplementation(async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            toolCalls: [{ id: "call-1", name: "test.safe", arguments: '{"x":1}' }],
          };
        } else {
          yield { content: "Done!" };
        }
      }),
    };

    const ctx = makeCtx(provider, registry);
    const events = await collectEvents(ctx);

    const types = events.map((e) => e.type);
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types[types.length - 1]).toBe("done");
  });

  it("tool_call 事件包含正确的工具名和参数", async () => {
    const safeTool: Tool = {
      name: "test.safe",
      description: "safe test tool",
      parameters: {},
      dangerLevel: "safe",
      execute: vi.fn().mockResolvedValue({ success: true, data: "ok" }),
    };

    const registry = new ToolRegistry();
    registry.register(safeTool);

    let callCount = 0;
    const provider: LLMProvider = {
      name: "mock",
      chat: vi.fn(),
      chatStream: vi.fn().mockImplementation(async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            toolCalls: [{ id: "call-1", name: "test.safe", arguments: '{"key":"value"}' }],
          };
        } else {
          yield { content: "Done" };
        }
      }),
    };

    const ctx = makeCtx(provider, registry);
    const events = await collectEvents(ctx);

    const toolCallEvent = events.find((e) => e.type === "tool_call") as {
      type: "tool_call";
      tool: string;
      params: unknown;
    };
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent.tool).toBe("test.safe");
    expect(toolCallEvent.params).toEqual({ key: "value" });
  });
});

describe("conversationLoop — 重试逻辑", () => {
  it("全部重试失败时 yield 错误文本 + done", async () => {
    // chatStream 始终抛出错误（同步抛出，不是 async generator 内部抛出）
    const provider: LLMProvider = {
      name: "mock",
      chat: vi.fn(),
      chatStream: vi.fn().mockImplementation(() => {
        throw new Error("network error");
      }),
    };

    // 使用 maxIterations=1 且覆盖 sleep 以加速测试
    const config = makeConfig(provider, new ToolRegistry(), { maxIterations: 1 });
    const ctx: LoopContext = {
      messages: [{ role: "user", content: "hello" }],
      config,
      getStatus: () => "running",
      setStatus: vi.fn(),
      onApprovalNeeded: undefined,
      logger,
    };

    const events = await collectEvents(ctx);
    const types = events.map((e) => e.type);

    // 应该有错误文本事件
    expect(types).toContain("text");
    expect(types[types.length - 1]).toBe("done");

    // 错误文本应包含错误信息
    const textEvent = events.find((e) => e.type === "text") as {
      type: "text";
      content: string;
    };
    expect(textEvent.content).toContain("Error");
  }, 15000);
});

describe("conversationLoop — 记忆检索失败", () => {
  it("记忆检索失败时继续对话（降级处理）", async () => {
    const provider = makeMockProvider([{ content: "Hello!" }]);
    const storage = makeMockStorage();
    // 让 recall 抛出错误
    (storage.recall as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const config = makeConfig(provider, new ToolRegistry(), { storage });
    const ctx: LoopContext = {
      messages: [{ role: "user", content: "hello" }],
      config,
      getStatus: () => "running",
      setStatus: vi.fn(),
      onApprovalNeeded: undefined,
      logger,
    };

    // 即使记忆检索失败，对话应该继续并正常结束
    const events = await collectEvents(ctx);
    const types = events.map((e) => e.type);

    expect(types[types.length - 1]).toBe("done");
    expect(types).toContain("text");
  });
});

describe("conversationLoop — maxIterations 限制", () => {
  it("工具调用轮次不超过 maxIterations", async () => {
    const safeTool: Tool = {
      name: "test.safe",
      description: "safe test tool",
      parameters: {},
      dangerLevel: "safe",
      execute: vi.fn().mockResolvedValue({ success: true, data: "ok" }),
    };

    const registry = new ToolRegistry();
    registry.register(safeTool);

    // chatStream 始终返回工具调用（永不返回纯文本）
    const provider: LLMProvider = {
      name: "mock",
      chat: vi.fn(),
      chatStream: vi.fn().mockImplementation(async function* () {
        yield {
          toolCalls: [{ id: "call-1", name: "test.safe", arguments: "{}" }],
        };
      }),
    };

    const maxIterations = 3;
    const config = makeConfig(provider, registry, { maxIterations });
    const ctx: LoopContext = {
      messages: [{ role: "user", content: "hello" }],
      config,
      getStatus: () => "running",
      setStatus: vi.fn(),
      onApprovalNeeded: undefined,
      logger,
    };

    const events = await collectEvents(ctx);

    const toolCallEvents = events.filter((e) => e.type === "tool_call");
    // tool_call 事件数量不超过 maxIterations
    expect(toolCallEvents.length).toBeLessThanOrEqual(maxIterations);

    // 最后一个事件仍然是 done
    expect(events[events.length - 1].type).toBe("done");
  });

  it("maxIterations=1 时最多执行一轮工具调用", async () => {
    const safeTool: Tool = {
      name: "test.safe",
      description: "safe test tool",
      parameters: {},
      dangerLevel: "safe",
      execute: vi.fn().mockResolvedValue({ success: true, data: "ok" }),
    };

    const registry = new ToolRegistry();
    registry.register(safeTool);

    const provider: LLMProvider = {
      name: "mock",
      chat: vi.fn(),
      chatStream: vi.fn().mockImplementation(async function* () {
        yield {
          toolCalls: [{ id: "call-1", name: "test.safe", arguments: "{}" }],
        };
      }),
    };

    const config = makeConfig(provider, registry, { maxIterations: 1 });
    const ctx: LoopContext = {
      messages: [{ role: "user", content: "hello" }],
      config,
      getStatus: () => "running",
      setStatus: vi.fn(),
      onApprovalNeeded: undefined,
      logger,
    };

    const events = await collectEvents(ctx);
    const toolCallEvents = events.filter((e) => e.type === "tool_call");

    expect(toolCallEvents.length).toBeLessThanOrEqual(1);
    expect(events[events.length - 1].type).toBe("done");
  });
});
