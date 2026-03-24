import type { Agent } from "@winches/agent";

export interface GatewayConfig {
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
  telegram: {
    botToken: string;
  };
  approval: {
    timeout: number; // 秒，默认 300
    defaultAction: "approve" | "reject";
  };
  storage: {
    dbPath: string;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
}

export interface ChatSession {
  chatId: number;
  sessionId: string; // 格式：telegram-{chatId}-{timestamp}
  agent: Agent;
  /** 当前正在更新的回复消息 ID（流式更新期间有值） */
  activeMessageId?: number;
  /** 工具调用 ID → Telegram 消息 ID 映射 */
  toolMessageMap: Map<string, number>;
}

export interface PendingApproval {
  approvalId: string; // 唯一 ID，用于 CallbackQuery data
  chatId: number;
  messageId: number; // 审批消息的 Telegram messageId
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean; // 防止重复触发
}

// InlineKeyboard 按钮的 callback_data 格式
export type CallbackData = `approve:${string}` | `reject:${string}`;
