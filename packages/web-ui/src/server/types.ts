import type { SessionInfo, ToolExecutionLog } from "@winches/storage";

// Re-export for convenience
export type { SessionInfo, ToolExecutionLog };

/** config.yaml 解析后的配置结构 */
export interface AppConfig {
  llm: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl: string | null;
  };
  embedding: {
    provider: string;
    model: string;
  };
  telegram: {
    botToken: string;
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

/** .env 变量展示模型 */
export interface EnvVar {
  key: string;
  maskedValue: string;
  isSet: boolean;
  inExample: boolean;
}

/** pino 日志条目 */
export interface LogEntry {
  timestamp: string;
  level: number;
  levelLabel: string;
  msg: string;
  [key: string]: unknown;
}

/** 系统状态概览 */
export interface SystemStatus {
  sessionCount: number;
  recentSession: SessionInfo | null;
  memoryCount: number;
  pendingTaskCount: number;
  recentToolLogs: ToolExecutionLog[];
}
