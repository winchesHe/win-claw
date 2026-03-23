import type { Message } from "@winches/ai";

// Re-export Message for convenience
export type { Message };

// ===== 配置类型 =====

/** Storage 包配置 */
export interface StorageConfig {
  dbPath: string;
  embedding: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
}

// ===== 业务类型 =====

/** 长期记忆条目 */
export interface Memory {
  id: string;
  content: string;
  tags: string[];
  createdAt: Date;
  vector?: number[];
}

/** 定时任务 */
export interface ScheduledTask {
  id: string;
  triggerAt: Date;
  payload: string;
  status: "pending" | "completed" | "cancelled";
}

/** 审批请求 */
export interface ApprovalRequest {
  toolName: string;
  params: unknown;
  dangerLevel: string;
  sessionId?: string;
}

/** 审批状态 */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "timeout";

/** 工具执行日志 */
export interface ToolExecutionLog {
  id: string;
  toolName: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  sessionId?: string;
  createdAt: Date;
}

// ===== 核心服务接口 =====

/** StorageService 核心服务接口 */
export interface StorageService {
  // 对话历史
  saveMessage(sessionId: string, message: Message): Promise<void>;
  getHistory(sessionId: string, limit?: number): Promise<Message[]>;
  searchHistory(query: string, topK?: number): Promise<Message[]>;

  // 长期记忆
  remember(content: string, tags?: string[]): Promise<Memory>;
  recall(query: string, topK?: number): Promise<Memory[]>;

  // 定时任务
  saveScheduledTask(task: ScheduledTask): Promise<void>;
  getPendingTasks(): Promise<ScheduledTask[]>;
  updateTaskStatus(
    id: string,
    status: "completed" | "cancelled",
  ): Promise<void>;

  // 审计日志
  logToolExecution(
    toolName: string,
    input: unknown,
    output: unknown,
    durationMs: number,
    sessionId?: string,
  ): Promise<void>;
  getToolExecutionLogs(filter?: {
    sessionId?: string;
    toolName?: string;
    limit?: number;
  }): Promise<ToolExecutionLog[]>;

  // 审批队列
  queueApproval(request: ApprovalRequest): Promise<string>;
  getApproval(id: string): Promise<ApprovalStatus>;
  updateApprovalStatus(
    id: string,
    status: Exclude<ApprovalStatus, "pending">,
  ): Promise<void>;
}
