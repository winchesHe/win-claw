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
    apiKey?: string;
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
  importance: number; // [0,1]，默认 0.5
  vector?: number[];
}

/** remember() 选项 */
export interface RememberOptions {
  importance?: number; // [0,1]
}

/** recall() 选项 */
export interface RecallOptions {
  topK?: number;
  decayRate?: number;        // λ，默认 0.1
  importanceWeight?: number; // w，默认 0.3
}

/** 遗忘策略 */
export type ForgetStrategy =
  | { type: 'importance'; threshold: number }
  | { type: 'time'; olderThanMs: number }
  | { type: 'capacity'; maxCount: number };

/** rememberWorking() 选项 */
export interface WorkingMemoryOptions {
  ttl?: number;        // 毫秒，默认 3_600_000（1h）
  capacity?: number;   // 每会话上限，默认 50
  importance?: number; // [0,1]，默认 0.5
}

/** 工作记忆条目 */
export interface WorkingMemory {
  id: string;
  sessionId: string;
  content: string;
  createdAt: Date;
  ttl: number;       // 毫秒
  importance: number;
}

/** searchEpisodic() 选项 */
export interface EpisodicSearchOptions {
  topK?: number;       // 默认 5
  sessionId?: string;  // 限定会话
  role?: string;       // 限定角色（"user" | "assistant" | ...）
}

/** 情景记忆检索结果 */
export interface EpisodicMemory {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: Date;
  similarity: number;  // 余弦相似度，∈ [0, 1]
}

/** 记忆摘要 */
export interface MemorySummary {
  longTerm: {
    count: number;
    avgImportance: number;
  };
  working: {
    count: number;
    activeCount: number;  // created_at + ttl > now
  };
  episodic: {
    totalMessages: number;
    vectorizedCount: number;  // vector IS NOT NULL
  };
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

/** 会话信息 */
export interface SessionInfo {
  sessionId: string;
  messageCount: number;
  lastActiveAt: Date;
}

// ===== 核心服务接口 =====

/** StorageService 核心服务接口 */
export interface StorageService {
  // 对话历史
  saveMessage(sessionId: string, message: Message): Promise<void>;
  getHistory(sessionId: string, limit?: number): Promise<Message[]>;
  searchHistory(query: string, topK?: number): Promise<Message[]>;
  listSessions(limit?: number): Promise<SessionInfo[]>;

  // 长期记忆
  remember(content: string, tags?: string[], options?: RememberOptions): Promise<Memory>;
  recall(query: string, topK?: number, options?: RecallOptions): Promise<Memory[]>;
  forget(strategy: ForgetStrategy): Promise<number>;

  // 工作记忆
  rememberWorking(content: string, sessionId: string, options?: WorkingMemoryOptions): Promise<WorkingMemory>;
  recallWorking(sessionId: string): Promise<WorkingMemory[]>;

  // 情景记忆
  searchEpisodic(query: string, options?: EpisodicSearchOptions): Promise<EpisodicMemory[]>;

  // 记忆摘要
  memorySummary(): Promise<MemorySummary>;

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
