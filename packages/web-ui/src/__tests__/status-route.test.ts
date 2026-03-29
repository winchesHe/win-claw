import { describe, it, expect, vi } from "vitest";
import type { StorageService, SessionInfo, ToolExecutionLog } from "@winches/storage";
import { createStatusRoutes } from "../server/routes/status.js";

function makeMockStorage(overrides: Partial<StorageService> = {}): StorageService {
  return {
    saveMessage: vi.fn(),
    getHistory: vi.fn(),
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

describe("status 路由", () => {
  it("GET /api/status 返回完整的 SystemStatus 结构", async () => {
    const session: SessionInfo = {
      sessionId: "s1",
      messageCount: 5,
      lastActiveAt: new Date("2024-01-01"),
    };
    const toolLog: ToolExecutionLog = {
      id: "log1",
      toolName: "file.read",
      input: { path: "/tmp" },
      output: { content: "hello" },
      durationMs: 42,
      sessionId: "s1",
      createdAt: new Date("2024-01-01"),
    };

    const storage = makeMockStorage({
      listSessions: vi
        .fn()
        .mockImplementation((limit?: number) =>
          limit === 1 ? Promise.resolve([session]) : Promise.resolve([session, session]),
        ),
      memorySummary: vi.fn().mockResolvedValue({
        longTerm: { count: 7, avgImportance: 0.6 },
        working: { count: 2, activeCount: 1 },
        episodic: { totalMessages: 10, vectorizedCount: 8 },
      }),
      getPendingTasks: vi.fn().mockResolvedValue([{ id: "t1" }, { id: "t2" }, { id: "t3" }]),
      getToolExecutionLogs: vi.fn().mockResolvedValue([toolLog]),
    });

    const app = createStatusRoutes(storage);
    const res = await app.request("/api/status");

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sessionCount).toBe(2);
    expect(body.recentSession).toEqual({
      sessionId: "s1",
      messageCount: 5,
      lastActiveAt: "2024-01-01T00:00:00.000Z",
    });
    expect(body.memoryCount).toBe(7);
    expect(body.pendingTaskCount).toBe(3);
    expect(body.recentToolLogs).toHaveLength(1);
    expect(body.recentToolLogs[0].toolName).toBe("file.read");
  });

  it("GET /api/status 无会话时 recentSession 为 null", async () => {
    const storage = makeMockStorage();
    const app = createStatusRoutes(storage);
    const res = await app.request("/api/status");

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sessionCount).toBe(0);
    expect(body.recentSession).toBeNull();
    expect(body.memoryCount).toBe(0);
    expect(body.pendingTaskCount).toBe(0);
    expect(body.recentToolLogs).toHaveLength(0);
  });

  it("GET /api/status 调用 getToolExecutionLogs 时传入 limit: 10", async () => {
    const storage = makeMockStorage();
    const app = createStatusRoutes(storage);
    await app.request("/api/status");

    expect(storage.getToolExecutionLogs).toHaveBeenCalledWith({ limit: 10 });
  });

  it("StorageService 调用失败时错误向上传播", async () => {
    const storage = makeMockStorage({
      listSessions: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    const app = createStatusRoutes(storage);
    const res = await app.request("/api/status");

    expect(res.status).toBe(500);
  });
});
