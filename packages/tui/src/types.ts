import type { ApprovalRequest, AgentStatus } from "@winches/agent";
import type { ToolResult } from "@winches/core";

export type { AgentStatus };

/** TUI 配置（对应 config.yaml 结构） */
export interface TuiConfig {
  llm: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
  embedding: {
    provider: string;
    model: string;
  };
  approval: {
    timeout: number;
    defaultAction: "reject" | "approve";
  };
  storage: {
    dbPath: string;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
}

/** 聊天消息联合类型 */
export type ChatMessage =
  | { id: string; type: "user"; content: string }
  | { id: string; type: "assistant"; content: string; streaming: boolean }
  | {
      id: string;
      type: "tool_call";
      toolName: string;
      params: unknown;
      dangerLevel?: string;
      status: "running" | "done" | "failed";
      result?: ToolResult;
    }
  | { id: string; type: "error"; content: string }
  | { id: string; type: "system"; content: string };

/** 待审批状态 */
export interface PendingApproval {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
}

/** App 全局状态 */
export interface AppState {
  messages: ChatMessage[];
  status: AgentStatus;
  currentSessionId: string;
  pendingApproval: PendingApproval | null;
}
