import Database from "better-sqlite3";
import pino from "pino";
import type { Message } from "@winches/ai";
import type {
  StorageService,
  Memory,
  ScheduledTask,
  ApprovalRequest,
  ApprovalStatus,
  ToolExecutionLog,
} from "./types.js";
import { EmbeddingService } from "./embedding.js";
import { ApprovalNotFoundError, DuplicateTaskError, EmbeddingError } from "./errors.js";

interface ToolExecutionLogRow {
  id: string;
  tool_name: string;
  input: string;
  output: string;
  duration_ms: number;
  session_id: string | null;
  created_at: number;
}

interface ApprovalRow {
  id: string;
  tool_name: string;
  params: string;
  danger_level: string;
  session_id: string | null;
  status: string;
  created_at: number;
}

interface ScheduledTaskRow {
  id: string;
  trigger_at: number;
  payload: string;
  status: string;
  created_at: number;
}

function deserializeTask(row: ScheduledTaskRow): ScheduledTask {
  return {
    id: row.id,
    triggerAt: new Date(row.trigger_at),
    payload: row.payload,
    status: row.status as ScheduledTask["status"],
  };
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_call_id: string | null;
  tool_calls: string | null;
  created_at: number;
}

interface MemoryRow {
  id: string;
  content: string;
  tags: string;
  created_at: number;
  vector: string | null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (normA * normB);
}

function deserializeMessage(row: MessageRow): Message {
  const msg: Message = {
    role: row.role as Message["role"],
    content: JSON.parse(row.content) as Message["content"],
  };
  // Restore toolCallId and toolCalls if present in the serialized metadata
  if (row.tool_call_id) {
    msg.toolCallId = row.tool_call_id;
  }
  if (row.tool_calls) {
    msg.toolCalls = JSON.parse(row.tool_calls) as Message["toolCalls"];
  }
  return msg;
}

export class SqliteStorageService implements StorageService {
  private readonly db: Database.Database;
  private readonly embedding: EmbeddingService;
  private readonly logger: pino.Logger<never, boolean>;

  constructor(db: Database.Database, embedding: EmbeddingService) {
    this.db = db;
    this.embedding = embedding;
    this.logger = pino({ name: "@winches/storage" });
  }

  // ===== 对话历史 =====

  async saveMessage(sessionId: string, message: Message): Promise<void> {
    const id = crypto.randomUUID();
    const content = JSON.stringify(message.content);
    const toolCallId = message.toolCallId ?? null;
    const toolCalls = message.toolCalls ? JSON.stringify(message.toolCalls) : null;
    const createdAt = Date.now();

    this.db
      .prepare(
        "INSERT INTO messages (id, session_id, role, content, tool_call_id, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, sessionId, message.role, content, toolCallId, toolCalls, createdAt);

    const textForEmbedding =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);

    void this.embedding
      .embed(textForEmbedding)
      .then(() => {
        // 向量存储在后续任务中实现
      })
      .catch((err: unknown) => {
        this.logger.error({ err }, "Failed to generate embedding for message");
      });
  }

  async getHistory(sessionId: string, limit?: number): Promise<Message[]> {
    if (limit !== undefined) {
      const rows = this.db
        .prepare(
          "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .all(sessionId, limit) as MessageRow[];
      return rows.reverse().map((row) => deserializeMessage(row));
    }

    const rows = this.db
      .prepare(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
      )
      .all(sessionId) as MessageRow[];
    return rows.map((row) => deserializeMessage(row));
  }

  async searchHistory(query: string, topK = 5): Promise<Message[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM messages WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(`%${query}%`, topK) as MessageRow[];
    return rows.map((row) => deserializeMessage(row));
  }

  // ===== 长期记忆 =====

  async remember(content: string, tags?: string[]): Promise<Memory> {
    let vector: number[];
    try {
      vector = await this.embedding.embed(content);
    } catch (cause) {
      throw new EmbeddingError("Failed to generate embedding for memory", { cause });
    }

    const id = crypto.randomUUID();
    const tagsJson = JSON.stringify(tags ?? []);
    const createdAt = Date.now();
    const vectorJson = JSON.stringify(vector);

    this.db
      .prepare(
        "INSERT INTO memories (id, content, tags, created_at, vector) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, content, tagsJson, createdAt, vectorJson);

    return {
      id,
      content,
      tags: tags ?? [],
      createdAt: new Date(createdAt),
      vector,
    };
  }

  async recall(query: string, topK = 5): Promise<Memory[]> {
    const queryVector = await this.embedding.embed(query);

    const rows = this.db
      .prepare("SELECT * FROM memories WHERE vector IS NOT NULL ORDER BY created_at DESC")
      .all() as MemoryRow[];

    if (rows.length === 0) return [];

    const scored = rows.map((row) => {
      const vec = JSON.parse(row.vector!) as number[];
      return {
        score: cosineSimilarity(queryVector, vec),
        memory: {
          id: row.id,
          content: row.content,
          tags: JSON.parse(row.tags) as string[],
          createdAt: new Date(row.created_at),
          vector: vec,
        } satisfies Memory,
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.memory);
  }

  // ===== 定时任务 =====

  async saveScheduledTask(task: ScheduledTask): Promise<void> {
    try {
      this.db
        .prepare(
          "INSERT INTO scheduled_tasks (id, trigger_at, payload, status, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(task.id, task.triggerAt.getTime(), task.payload, "pending", Date.now());
    } catch (err) {
      if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
        throw new DuplicateTaskError(task.id, { cause: err });
      }
      throw err;
    }
  }

  async getPendingTasks(): Promise<ScheduledTask[]> {
    const now = Date.now();
    const rows = this.db
      .prepare(
        "SELECT * FROM scheduled_tasks WHERE status = 'pending' AND trigger_at > ? ORDER BY trigger_at ASC",
      )
      .all(now) as ScheduledTaskRow[];
    return rows.map((row) => deserializeTask(row));
  }

  async updateTaskStatus(
    id: string,
    status: "completed" | "cancelled",
  ): Promise<void> {
    this.db
      .prepare("UPDATE scheduled_tasks SET status = ? WHERE id = ?")
      .run(status, id);
  }

  // ===== 审计日志 =====

  async logToolExecution(
    toolName: string,
    input: unknown,
    output: unknown,
    durationMs: number,
    sessionId?: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    const inputJson = JSON.stringify(input);
    const outputJson = JSON.stringify(output);
    const createdAt = Date.now();

    this.db
      .prepare(
        "INSERT INTO tool_execution_logs (id, tool_name, input, output, duration_ms, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, toolName, inputJson, outputJson, durationMs, sessionId ?? null, createdAt);
  }

  async getToolExecutionLogs(filter?: {
    sessionId?: string;
    toolName?: string;
    limit?: number;
  }): Promise<ToolExecutionLog[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.sessionId !== undefined) {
      conditions.push("session_id = ?");
      params.push(filter.sessionId);
    }
    if (filter?.toolName !== undefined) {
      conditions.push("tool_name = ?");
      params.push(filter.toolName);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter?.limit ?? 50;
    params.push(limit);

    const rows = this.db
      .prepare(`SELECT * FROM tool_execution_logs ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params) as ToolExecutionLogRow[];

    return rows.map((row) => ({
      id: row.id,
      toolName: row.tool_name,
      input: JSON.parse(row.input) as unknown,
      output: JSON.parse(row.output) as unknown,
      durationMs: row.duration_ms,
      sessionId: row.session_id ?? undefined,
      createdAt: new Date(row.created_at),
    }));
  }

  // ===== 审批队列 =====

  async queueApproval(request: ApprovalRequest): Promise<string> {
    const id = crypto.randomUUID();
    const paramsJson = JSON.stringify(request.params);
    const createdAt = Date.now();

    this.db
      .prepare(
        "INSERT INTO approval_requests (id, tool_name, params, danger_level, session_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, request.toolName, paramsJson, request.dangerLevel, request.sessionId ?? null, "pending", createdAt);

    return id;
  }

  async getApproval(id: string): Promise<ApprovalStatus> {
    const row = this.db
      .prepare("SELECT * FROM approval_requests WHERE id = ?")
      .get(id) as ApprovalRow | undefined;

    if (!row) {
      throw new ApprovalNotFoundError(id);
    }

    return row.status as ApprovalStatus;
  }

  async updateApprovalStatus(
    id: string,
    status: Exclude<ApprovalStatus, "pending">,
  ): Promise<void> {
    this.db
      .prepare("UPDATE approval_requests SET status = ? WHERE id = ?")
      .run(status, id);
  }
}
