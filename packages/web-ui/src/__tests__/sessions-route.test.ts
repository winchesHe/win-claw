import { describe, it, expect, vi } from "vitest";
import type { StorageService, SessionInfo } from "@winches/storage";
import { createSessionsRoutes } from "../server/routes/sessions.js";

interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  toolCallId?: string;
}

function makeMockStorage(overrides: Partial<StorageService> = {}): StorageService {
  return {
    saveMessage: vi.fn(),
    getHistory: vi.fn().mockResolvedValue([]),
    searchHistory: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
    remember: vi.fn(),
    recall: vi.fn(),
    forget: vi.fn(),
    rememberWorking: vi.fn(),
    recallWorking: vi.fn(),
    searchEpisodic: vi.fn(),
    memorySummary: vi.fn().mockResolvedValue({
      longTerm: { count: 0, avgImportance: 0 },
      working: { count: 0, activeCount: 0 },
      episodic: { totalMessages: 0, vectorizedCount: 0 },
    }),
    saveScheduledTask: vi.fn(),
    getPendingTasks: vi.fn().mockResolvedValue([]),
    updateTaskStatus: vi.fn(),
    logToolExecution: vi.fn(),
    getToolExecutionLogs: vi.fn().mockResolvedValue([]),
    queueApproval: vi.fn(),
    getApproval: vi.fn(),
    updateApprovalStatus: vi.fn(),
    ...overrides,
  } as unknown as StorageService;
}

describe("sessions 路由", () => {
  it("GET /api/sessions 返回按 lastActiveAt 降序排列的会话列表", async () => {
    const sessions: SessionInfo[] = [
      { sessionId: "s1", messageCount: 3, lastActiveAt: new Date("2024-01-01") },
      { sessionId: "s3", messageCount: 1, lastActiveAt: new Date("2024-03-01") },
      { sessionId: "s2", messageCount: 5, lastActiveAt: new Date("2024-02-01") },
    ];

    const storage = makeMockStorage({
      listSessions: vi.fn().mockResolvedValue(sessions),
    });
    const app = createSessionsRoutes(storage);
    const res = await app.request("/api/sessions");

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(3);
    expect(body[0].sessionId).toBe("s3");
    expect(body[1].sessionId).toBe("s2");
    expect(body[2].sessionId).toBe("s1");
  });

  it("GET /api/sessions 空会话列表返回空数组", async () => {
    const storage = makeMockStorage();
    const app = createSessionsRoutes(storage);
    const res = await app.request("/api/sessions");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("GET /api/sessions/:id/messages 返回消息记录", async () => {
    const messages: Message[] = [
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好！有什么可以帮你的？" },
    ];

    const storage = makeMockStorage({
      getHistory: vi.fn().mockResolvedValue(messages),
    });
    const app = createSessionsRoutes(storage);
    const res = await app.request("/api/sessions/s1/messages");

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(2);
    expect(body[0].role).toBe("user");
    expect(body[0].content).toBe("你好");
    expect(body[1].role).toBe("assistant");
    expect(storage.getHistory).toHaveBeenCalledWith("s1");
  });

  it("GET /api/sessions/:id/messages 返回包含 toolCalls 和 toolCallId 的消息", async () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "file.read", arguments: '{"path":"/tmp/test.txt"}' }],
      },
      {
        role: "tool",
        content: "文件内容",
        toolCallId: "tc1",
      },
    ];

    const storage = makeMockStorage({
      getHistory: vi.fn().mockResolvedValue(messages),
    });
    const app = createSessionsRoutes(storage);
    const res = await app.request("/api/sessions/s1/messages");

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(2);
    // assistant message with toolCalls
    expect(body[0].toolCalls).toHaveLength(1);
    expect(body[0].toolCalls[0].id).toBe("tc1");
    expect(body[0].toolCalls[0].name).toBe("file.read");
    expect(body[0].toolCalls[0].arguments).toBe('{"path":"/tmp/test.txt"}');
    // tool message with toolCallId
    expect(body[1].role).toBe("tool");
    expect(body[1].toolCallId).toBe("tc1");
    expect(body[1].content).toBe("文件内容");
  });

  it("GET /api/sessions/:id/messages 不存在的会话返回空数组", async () => {
    const storage = makeMockStorage({
      getHistory: vi.fn().mockResolvedValue([]),
    });
    const app = createSessionsRoutes(storage);
    const res = await app.request("/api/sessions/nonexistent/messages");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
