import type { LLMProvider, Message } from "@winches/ai";
import type { ToolRegistry, ToolResult } from "@winches/core";
import type { StorageService } from "@winches/storage";
import type { DangerLevel } from "@winches/core";

/** Agent 构造配置 */
export interface AgentConfig {
  provider: LLMProvider;
  storage: StorageService;
  registry: ToolRegistry;
  sessionId: string;
  systemPrompt?: string;
  maxIterations?: number;
}

/** Agent 运行状态 */
export type AgentStatus = "idle" | "running" | "waiting_approval";

/** 需要用户审批的工具调用请求 */
export interface ApprovalRequest {
  toolName: string;
  params: unknown;
  dangerLevel: DangerLevel;
}

/** Agent 流式事件（判别联合类型） */
export type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; tool: string; params: unknown }
  | { type: "tool_result"; result: ToolResult }
  | { type: "approval_needed"; request: ApprovalRequest }
  | { type: "done" };
