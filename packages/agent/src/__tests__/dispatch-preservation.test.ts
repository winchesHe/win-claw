/**
 * Preservation Property Tests — executeToolCall baseline behavior
 *
 * **Validates: Requirements 3.1, 3.4, 3.5**
 *
 * These tests MUST PASS on UNFIXED code to establish baseline behavior.
 * They capture non-buggy behavior that must be preserved after the fix.
 *
 * Property 3: Valid params with all required fields → tool.execute called with correct params
 * Property (invalid JSON): Invalid JSON strings → returns "Invalid JSON arguments" error
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
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

describe("Preservation — executeToolCall baseline behavior", () => {
  /**
   * Property 3: Valid params with all required fields execute correctly
   *
   * **Validates: Requirements 3.1**
   *
   * For any tool call where JSON parsing succeeds AND all required parameters
   * are present, executeToolCall passes params to tool.execute and returns the result.
   */
  it("should call tool.execute with parsed params when all required fields are present", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random required field name and a random string value for it
        fc.record({
          fieldName: fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,9}$/),
          fieldValue: fc.string({ minLength: 1, maxLength: 50 }),
          extraField: fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,9}$/),
          extraValue: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          toolCallId: fc.stringMatching(/^call_[a-zA-Z0-9]{1,10}$/),
          resultData: fc.string(),
        }),
        async ({ fieldName, fieldValue, extraField, extraValue, toolCallId, resultData }) => {
          const executeSpy = vi.fn().mockResolvedValue({ success: true, data: resultData });

          const tool: Tool = {
            name: "test.tool",
            description: "test tool",
            dangerLevel: "safe",
            parameters: {
              type: "object",
              properties: {
                [fieldName]: { type: "string" },
                [extraField]: { type: "string" },
              },
              required: [fieldName],
            },
            execute: executeSpy,
          };

          const registry = new ToolRegistry();
          registry.register(tool);
          const ctx = makeCtx({ registry });

          const params: Record<string, unknown> = { [fieldName]: fieldValue };
          // Sometimes include the extra field too
          if (extraField !== fieldName) {
            params[extraField] = extraValue;
          }

          const result = await executeToolCall(
            { id: toolCallId, name: "test.tool", arguments: JSON.stringify(params) },
            ctx,
          );

          // tool.execute should have been called with the parsed params
          expect(executeSpy).toHaveBeenCalledOnce();
          const calledWith = executeSpy.mock.calls[0][0] as Record<string, unknown>;
          expect(calledWith[fieldName]).toBe(fieldValue);

          // Result should pass through from tool.execute
          expect(result.toolResult.success).toBe(true);
          expect(result.rejected).toBe(false);
          if (result.toolResult.success) {
            expect(result.toolResult.data).toBe(resultData);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Invalid JSON strings → returns "Invalid JSON arguments" error
   *
   * **Validates: Requirements 3.1**
   *
   * For any invalid JSON string as tool arguments, executeToolCall returns
   * an error containing "Invalid JSON arguments" without calling tool.execute.
   */
  it("should return Invalid JSON arguments error for invalid JSON strings", async () => {
    // Generate strings that are definitely not valid JSON
    const invalidJsonArb = fc.oneof(
      // Strings that start with { but are malformed
      fc.string({ minLength: 1 }).map((s) => `{${s}}`),
      // Strings with unmatched brackets
      fc.string({ minLength: 1 }).map((s) => `{${s}`),
      // Plain words (not valid JSON)
      fc.stringMatching(/^[a-zA-Z]{2,10}$/),
      // Strings with trailing commas
      fc.string().map((s) => `{"key": "${s}",}`),
    ).filter((s) => {
      try {
        JSON.parse(s);
        return false; // Exclude if it happens to be valid JSON
      } catch {
        return true; // Keep only truly invalid JSON
      }
    });

    await fc.assert(
      fc.asyncProperty(
        invalidJsonArb,
        fc.stringMatching(/^[a-z][a-zA-Z.]{0,15}$/),
        async (invalidJson, toolName) => {
          const executeSpy = vi.fn().mockResolvedValue({ success: true, data: "ok" });

          const tool: Tool = {
            name: toolName,
            description: "test",
            dangerLevel: "safe",
            parameters: { type: "object" },
            execute: executeSpy,
          };

          const registry = new ToolRegistry();
          registry.register(tool);
          const ctx = makeCtx({ registry });

          const result = await executeToolCall(
            { id: "call_1", name: toolName, arguments: invalidJson },
            ctx,
          );

          // Should return error
          expect(result.toolResult.success).toBe(false);
          if (!result.toolResult.success) {
            expect(result.toolResult.error).toContain("Invalid JSON arguments");
          }
          expect(result.rejected).toBe(false);

          // tool.execute should NOT have been called
          expect(executeSpy).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  });
});
