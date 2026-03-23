import type { ToolCall } from "@winches/ai";
import type { ToolRegistry, ToolResult } from "@winches/core";
import type { StorageService } from "@winches/storage";
import type { ApprovalRequest, AgentStatus } from "./types.js";
import type pino from "pino";

export interface DispatchContext {
  registry: ToolRegistry;
  storage: StorageService;
  sessionId: string;
  setStatus: (status: AgentStatus) => void;
  onApprovalNeeded: ((request: ApprovalRequest) => Promise<boolean>) | undefined;
  logger: pino.Logger;
}

export interface DispatchResult {
  toolResult: ToolResult;
  /** 工具是否被拒绝（未执行） */
  rejected: boolean;
}

/**
 * 执行单个工具调用，处理权限审批逻辑。
 *
 * 流程：
 * 1. 从 registry 查找工具（未找到则返回错误 ToolResult）
 * 2. 解析 arguments JSON（解析失败则返回错误 ToolResult）
 * 3. 根据 dangerLevel 决定是否需要审批
 * 4. 执行工具，捕获所有异常
 * 5. 记录 logToolExecution（失败时仅 warn，不中断）
 */
export async function executeToolCall(
  toolCall: ToolCall,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  const { registry, storage, sessionId, setStatus, onApprovalNeeded, logger } = ctx;

  // 1. 查找工具
  const tool = registry.get(toolCall.name);
  if (!tool) {
    logger.warn({ toolName: toolCall.name }, "tool not found in registry");
    return {
      toolResult: { success: false, error: `Tool "${toolCall.name}" is not registered` },
      rejected: false,
    };
  }

  // 2. 解析参数
  let params: unknown;
  try {
    params = JSON.parse(toolCall.arguments || "{}");
  } catch {
    return {
      toolResult: { success: false, error: `Invalid JSON arguments for tool "${toolCall.name}"` },
      rejected: false,
    };
  }

  logger.debug({ toolName: toolCall.name, dangerLevel: tool.dangerLevel }, "executing tool");

  // 3. 权限审批
  if (tool.dangerLevel !== "safe") {
    const request: ApprovalRequest = {
      toolName: toolCall.name,
      params,
      dangerLevel: tool.dangerLevel,
    };

    setStatus("waiting_approval");

    let approved = false;
    if (onApprovalNeeded) {
      approved = await onApprovalNeeded(request);
    }

    setStatus("running");

    if (!approved) {
      const reason = onApprovalNeeded ? "user_rejected" : "no_callback";
      logger.info({ toolName: toolCall.name, reason }, "tool call rejected");
      return {
        toolResult: { success: false, error: `Tool "${toolCall.name}" was rejected by user` },
        rejected: true,
      };
    }
  }

  // 4. 执行工具
  const startTime = Date.now();
  let toolResult: ToolResult;

  try {
    toolResult = await tool.execute(params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ toolName: toolCall.name, err }, "tool execution threw unexpected error");
    toolResult = { success: false, error: message };
  }

  // 5. 记录执行日志
  const durationMs = Date.now() - startTime;
  await storage.logToolExecution(toolCall.name, params, toolResult, durationMs, sessionId).catch((err) => {
    logger.warn({ err }, "failed to log tool execution");
  });

  return { toolResult, rejected: false };
}
