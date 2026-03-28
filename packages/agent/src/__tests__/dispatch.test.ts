import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { ToolRegistry } from "@winches/core";
import { executeToolCall } from "../dispatch.js";
import type { DispatchContext } from "../dispatch.js";
import type { StorageService } from "@winches/storage";
import type { Tool } from "@winches/core";

const logger = pino({ level: "silent" });

function makeStorage(): StorageService {
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

function makeCtx(overrides?: Partial<DispatchContext>): DispatchContext {
  return {
    registry: new ToolRegistry(),
    storage: makeStorage(),
    sessionId: "test-session",
    setStatus: vi.fn(),
    onApprovalNeeded: undefined,
    logger,
    ...overrides,
  };
}

function makeTool(overrides?: Partial<Tool>): Tool {
  return {
    name: "test.tool",
    description: "test",
    parameters: {},
    dangerLevel: "safe",
    execute: vi.fn().mockResolvedValue({ success: true, data: "ok" }),
    ...overrides,
  };
}

describe("executeToolCall", () => {
  it("safe 工具直接执行，不调用 onApprovalNeeded", async () => {
    const onApprovalNeeded = vi.fn().mockResolvedValue(true);
    const tool = makeTool({ dangerLevel: "safe" });
    const registry = new ToolRegistry();
    registry.register(tool);

    const ctx = makeCtx({ registry, onApprovalNeeded });
    const result = await executeToolCall({ id: "c1", name: "test.tool", arguments: "{}" }, ctx);

    expect(onApprovalNeeded).not.toHaveBeenCalled();
    expect(tool.execute).toHaveBeenCalled();
    expect(result.rejected).toBe(false);
    expect(result.toolResult.success).toBe(true);
  });

  it("confirm 工具调用 onApprovalNeeded 后执行", async () => {
    const onApprovalNeeded = vi.fn().mockResolvedValue(true);
    const tool = makeTool({ dangerLevel: "confirm" });
    const registry = new ToolRegistry();
    registry.register(tool);

    const ctx = makeCtx({ registry, onApprovalNeeded });
    const result = await executeToolCall({ id: "c2", name: "test.tool", arguments: "{}" }, ctx);

    expect(onApprovalNeeded).toHaveBeenCalledOnce();
    expect(tool.execute).toHaveBeenCalled();
    expect(result.rejected).toBe(false);
  });

  it("onApprovalNeeded 返回 false 时工具不被执行（rejected: true）", async () => {
    const onApprovalNeeded = vi.fn().mockResolvedValue(false);
    const tool = makeTool({ dangerLevel: "confirm" });
    const registry = new ToolRegistry();
    registry.register(tool);

    const ctx = makeCtx({ registry, onApprovalNeeded });
    const result = await executeToolCall({ id: "c3", name: "test.tool", arguments: "{}" }, ctx);

    expect(tool.execute).not.toHaveBeenCalled();
    expect(result.rejected).toBe(true);
    expect(result.toolResult.success).toBe(false);
  });

  it("工具未注册时返回错误 ToolResult", async () => {
    const ctx = makeCtx();
    const result = await executeToolCall(
      { id: "c4", name: "nonexistent.tool", arguments: "{}" },
      ctx,
    );

    expect(result.rejected).toBe(false);
    expect(result.toolResult.success).toBe(false);
    if (!result.toolResult.success) {
      expect(result.toolResult.error).toContain("nonexistent.tool");
    }
  });

  it("arguments JSON 解析失败时返回错误 ToolResult", async () => {
    const tool = makeTool();
    const registry = new ToolRegistry();
    registry.register(tool);

    const ctx = makeCtx({ registry });
    const result = await executeToolCall(
      { id: "c5", name: "test.tool", arguments: "not-valid-json{{{" },
      ctx,
    );

    expect(result.rejected).toBe(false);
    expect(result.toolResult.success).toBe(false);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("工具执行抛出异常时捕获并返回错误 ToolResult", async () => {
    const tool = makeTool({
      execute: vi.fn().mockRejectedValue(new Error("disk full")),
    });
    const registry = new ToolRegistry();
    registry.register(tool);

    const ctx = makeCtx({ registry });
    const result = await executeToolCall({ id: "c6", name: "test.tool", arguments: "{}" }, ctx);

    expect(result.rejected).toBe(false);
    expect(result.toolResult.success).toBe(false);
    if (!result.toolResult.success) {
      expect(result.toolResult.error).toContain("disk full");
    }
  });

  it("setStatus 在审批流程中被调用", async () => {
    const setStatus = vi.fn();
    const onApprovalNeeded = vi.fn().mockResolvedValue(true);
    const tool = makeTool({ dangerLevel: "confirm" });
    const registry = new ToolRegistry();
    registry.register(tool);

    const ctx = makeCtx({ registry, setStatus, onApprovalNeeded });
    await executeToolCall({ id: "c7", name: "test.tool", arguments: "{}" }, ctx);

    expect(setStatus).toHaveBeenCalledWith("waiting_approval");
    expect(setStatus).toHaveBeenCalledWith("running");
  });
});
