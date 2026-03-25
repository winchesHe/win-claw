import Database from "better-sqlite3";
import pino from "pino";
import type { Message } from "@winches/ai";
import type {
  StorageService,
  Memory,
  RememberOptions,
  RecallOptions,
  ForgetStrategy,
  WorkingMemoryOptions,
  WorkingMemory,
  SessionInfo,
  ScheduledTask,
  ApprovalRequest,
  ApprovalStatus,
  ToolExecutionLog,
  EpisodicMemory,
  EpisodicSearchOptions,
  MemorySummary,
} from "./types.js";
import { EmbeddingService } from "./embedding.js";
import { ApprovalNotFoundError, DuplicateTaskError, EmbeddingError, InvalidImportanceError, InvalidDecayRateError, InvalidForgetOptionsError } from "./errors.js";

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
  vector: string | null;
}

interface MemoryRow {
  id: string;
  content: string;
  tags: string;
  created_at: number;
  importance: number;
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
      .then((vector) => {
        this.db
          .prepare("UPDATE messages SET vector = ? WHERE id = ?")
          .run(JSON.stringify(vector), id);
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

  async listSessions(limit = 20): Promise<SessionInfo[]> {
    const rows = this.db
      .prepare(
        `SELECT session_id, COUNT(*) as message_count, MAX(created_at) as last_active_at
         FROM messages
         GROUP BY session_id
         ORDER BY last_active_at DESC
         LIMIT ?`,
      )
      .all(limit) as { session_id: string; message_count: number; last_active_at: number }[];

    return rows.map((row) => ({
      sessionId: row.session_id,
      messageCount: row.message_count,
      lastActiveAt: new Date(row.last_active_at),
    }));
  }

  async searchEpisodic(query: string, options?: EpisodicSearchOptions): Promise<EpisodicMemory[]> {
    const topK = options?.topK ?? 5;

    const conditions: string[] = ["vector IS NOT NULL"];
    const params: unknown[] = [];

    if (options?.sessionId !== undefined) {
      conditions.push("session_id = ?");
      params.push(options.sessionId);
    }
    if (options?.role !== undefined) {
      conditions.push("role = ?");
      params.push(options.role);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const rows = this.db
      .prepare(`SELECT * FROM messages ${where} ORDER BY created_at DESC`)
      .all(...params) as MessageRow[];

    if (rows.length === 0) return [];

    const queryVector = await this.embedding.embed(query);

    const scored = rows.map((row) => {
      const vec = JSON.parse(row.vector!) as number[];
      const similarity = cosineSimilarity(queryVector, vec);
      return {
        similarity,
        entry: {
          id: row.id,
          sessionId: row.session_id,
          role: row.role,
          content: row.content,
          createdAt: new Date(row.created_at),
          similarity,
        } satisfies EpisodicMemory,
      };
    });

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((s) => s.entry);
  }

  // ===== 长期记忆 =====

  async remember(content: string, tags?: string[], options?: RememberOptions): Promise<Memory> {
    const importance = options?.importance ?? 0.5;

    if (importance < 0 || importance > 1) {
      throw new InvalidImportanceError(importance);
    }

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
        "INSERT INTO memories (id, content, tags, created_at, importance, vector) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, content, tagsJson, createdAt, importance, vectorJson);

    return {
      id,
      content,
      tags: tags ?? [],
      createdAt: new Date(createdAt),
      importance,
      vector,
    };
  }

  async recall(query: string, topK = 5, options?: RecallOptions): Promise<Memory[]> {
    const decayRate = options?.decayRate ?? 0.1;

    if (decayRate < 0) {
      throw new InvalidDecayRateError(decayRate);
    }

    const importanceWeight = options?.importanceWeight ?? 0.3;
    const limit = options?.topK ?? topK;

    const queryVector = await this.embedding.embed(query);

    const rows = this.db
      .prepare("SELECT * FROM memories WHERE vector IS NOT NULL ORDER BY created_at DESC")
      .all() as MemoryRow[];

    if (rows.length === 0) return [];

    const now = Date.now();

    const scored = rows.map((row) => {
      const vec = JSON.parse(row.vector!) as number[];
      const similarity = cosineSimilarity(queryVector, vec);
      const ageInDays = (now - row.created_at) / 86_400_000;
      const decay = Math.exp(-decayRate * ageInDays);
      const compositeScore = similarity * decay * (1 + importanceWeight * row.importance);
      return {
        score: compositeScore,
        memory: {
          id: row.id,
          content: row.content,
          tags: JSON.parse(row.tags) as string[],
          createdAt: new Date(row.created_at),
          importance: row.importance,
          vector: vec,
        } satisfies Memory,
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.memory);
  }

  // ===== 遗忘机制 =====

  async forget(strategy: ForgetStrategy): Promise<number> {
    // Validate strategy fields before executing any deletes (Req 3.5)
    if (strategy.type === 'importance') {
      if (strategy.threshold === undefined || strategy.threshold === null) {
        throw new InvalidForgetOptionsError('threshold');
      }
    } else if (strategy.type === 'time') {
      if (strategy.olderThanMs === undefined || strategy.olderThanMs === null) {
        throw new InvalidForgetOptionsError('olderThanMs');
      }
    } else if (strategy.type === 'capacity') {
      if (strategy.maxCount === undefined || strategy.maxCount === null) {
        throw new InvalidForgetOptionsError('maxCount');
      }
    } else {
      throw new InvalidForgetOptionsError('type');
    }

    // Execute all deletes atomically in a single transaction (Req 3.6)
    const runInTransaction = this.db.transaction(() => {
      if (strategy.type === 'importance') {
        // Delete all memories where importance < threshold (Req 3.2)
        const result = this.db
          .prepare('DELETE FROM memories WHERE importance < ?')
          .run(strategy.threshold);
        return result.changes;
      } else if (strategy.type === 'time') {
        // Delete all memories where created_at < (now - olderThanMs) (Req 3.3)
        const cutoff = Date.now() - strategy.olderThanMs;
        const result = this.db
          .prepare('DELETE FROM memories WHERE created_at < ?')
          .run(cutoff);
        return result.changes;
      } else {
        // capacity strategy: keep top maxCount by retention_score, delete the rest (Req 3.4)
        // retention_score = importance × exp(-0.1 × age_in_days)
        const now = Date.now();
        const rows = this.db
          .prepare('SELECT id, importance, created_at FROM memories')
          .all() as { id: string; importance: number; created_at: number }[];

        if (rows.length <= strategy.maxCount) {
          return 0;
        }

        const scored = rows.map((row) => {
          const ageInDays = (now - row.created_at) / 86_400_000;
          const retentionScore = row.importance * Math.exp(-0.1 * ageInDays);
          return { id: row.id, score: retentionScore };
        });

        // Sort descending by retention score, keep top maxCount, delete the rest
        scored.sort((a, b) => b.score - a.score);
        const toDelete = scored.slice(strategy.maxCount).map((s) => s.id);

        if (toDelete.length === 0) return 0;

        const placeholders = toDelete.map(() => '?').join(', ');
        const result = this.db
          .prepare(`DELETE FROM memories WHERE id IN (${placeholders})`)
          .run(...toDelete);
        return result.changes;
      }
    });

    return runInTransaction() as number;
  }

  // ===== 工作记忆 =====

  async rememberWorking(content: string, sessionId: string, options?: WorkingMemoryOptions): Promise<WorkingMemory> {
    const ttl = options?.ttl ?? 3_600_000;
    const capacity = options?.capacity ?? 50;
    const importance = options?.importance ?? 0.5;

    // Check if at capacity; if so, evict the oldest entry for this session (Req 4.4, 4.7)
    const countRow = this.db
      .prepare('SELECT COUNT(*) as count FROM working_memories WHERE session_id = ?')
      .get(sessionId) as { count: number };

    if (countRow.count >= capacity) {
      this.db
        .prepare(
          'DELETE FROM working_memories WHERE id = (SELECT id FROM working_memories WHERE session_id = ? ORDER BY created_at ASC LIMIT 1)',
        )
        .run(sessionId);
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();

    this.db
      .prepare(
        'INSERT INTO working_memories (id, session_id, content, created_at, ttl, importance) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, sessionId, content, createdAt, ttl, importance);

    return {
      id,
      sessionId,
      content,
      createdAt: new Date(createdAt),
      ttl,
      importance,
    };
  }

  async recallWorking(sessionId: string): Promise<WorkingMemory[]> {
    const now = Date.now();

    // Only return non-expired entries: created_at + ttl > now (Req 4.3)
    const rows = this.db
      .prepare(
        'SELECT * FROM working_memories WHERE session_id = ? AND (created_at + ttl) > ? ORDER BY created_at ASC',
      )
      .all(sessionId, now) as {
        id: string;
        session_id: string;
        content: string;
        created_at: number;
        ttl: number;
        importance: number;
      }[];

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      content: row.content,
      createdAt: new Date(row.created_at),
      ttl: row.ttl,
      importance: row.importance,
    }));
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

  // ===== 记忆摘要 =====

  async memorySummary(): Promise<MemorySummary> {
    const now = Date.now();

    const longTermCount = (this.db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number }).count;
    const avgImportanceRow = this.db.prepare("SELECT AVG(importance) as avg FROM memories").get() as { avg: number | null };
    const avgImportance = avgImportanceRow.avg ?? 0;

    const workingCount = (this.db.prepare("SELECT COUNT(*) as count FROM working_memories").get() as { count: number }).count;
    const workingActiveCount = (this.db.prepare("SELECT COUNT(*) as count FROM working_memories WHERE created_at + ttl > ?").get(now) as { count: number }).count;

    const totalMessages = (this.db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number }).count;
    const vectorizedCount = (this.db.prepare("SELECT COUNT(*) as count FROM messages WHERE vector IS NOT NULL").get() as { count: number }).count;

    return {
      longTerm: { count: longTermCount, avgImportance },
      working: { count: workingCount, activeCount: workingActiveCount },
      episodic: { totalMessages, vectorizedCount },
    };
  }
}
