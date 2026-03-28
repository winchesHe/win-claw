/**
 * Bug Condition Exploration Test — Parameter Validation
 *
 * **Validates: Requirements 1.1, 2.1**
 *
 * This test MUST FAIL on unfixed code to confirm the bug exists.
 * On UNFIXED code: tool.execute IS called with undefined params → test FAILS.
 * After fix: executeToolCall returns a clear error without calling tool.execute.
 */
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

describe("Bug Exploration — Missing required parameter validation", () => {
  it("should return error and NOT call execute when required param 'dirPath' is missing", async () => {
    const executeSpy = vi.fn().mockResolvedValue({ success: true, data: [] });

    const tool: Tool = {
      name: "file.list",
      description: "List directory contents",
      dangerLevel: "safe",
      parameters: {
        type: "object",
        properties: {
          dirPath: { type: "string", description: "Directory path" },
          recursive: { type: "boolean", description: "Recursive listing" },
        },
        required: ["dirPath"],
      },
      execute: executeSpy,
    };

    const registry = new ToolRegistry();
    registry.register(tool);
    const ctx = makeCtx({ registry });

    // Call with valid JSON but missing required param "dirPath"
    const result = await executeToolCall({ id: "call_1", name: "file.list", arguments: "{}" }, ctx);

    // Expected behavior: should fail with clear error mentioning "dirPath"
    expect(result.toolResult.success).toBe(false);
    expect(result.toolResult.success === false && result.toolResult.error).toContain("dirPath");

    // Expected behavior: tool.execute should NOT have been called
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
