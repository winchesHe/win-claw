import { describe, it, expect, vi } from "vitest";
import type { StorageService, ToolExecutionLog } from "@winches/storage";
import { createToolLogsRoutes } from "../server/routes/tool-logs.js";

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

const sampleLogs: ToolExecutionLog[] = [
  {
    id: "log1",
    toolName: "file.read",
    input: { path: "/tmp/a.txt" },
    output: { content: "hello" },
    durationMs: 10,
    sessionId: "s1",
    createdAt: new Date("2024-01-01"),
  },
  {
    id: "log2",
    toolName: "shell.exec",
    input: { command: "ls" },
    output: { stdout: "file.txt" },
    durationMs: 50,
    sessionId: "s2",
    createdAt: new Date("2024-01-02"),
  },
  {
    id: "log3",
    toolName: "file.read",
    input: { path: "/tmp/b.txt" },
    output: { content: "world" },
    durationMs: 15,
    sessionId: "s1",
    createdAt: new Date("2024-01-03"),
  },
];

describe("tool-logs 路由", () => {
  it("GET /api/tool-logs 返回所有日志", async () => {
    const storage = makeMockStorage({
      getToolExecutionLogs: vi.fn().mockResolvedValue(sampleLogs),
    });
    const app = createToolLogsRoutes(storage);
    const res = await app.request("/api/tool-logs");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(3);
    expect(storage.getToolExecutionLogs).toHaveBeenCalledWith({});
  });

  it("GET /api/tool-logs?toolName=file.read 按工具名称筛选", async () => {
    const filtered = sampleLogs.filter((l) => l.toolName === "file.read");
    const storage = makeMockStorage({
      getToolExecutionLogs: vi.fn().mockResolvedValue(filtered),
    });
    const app = createToolLogsRoutes(storage);
    const res = await app.request("/api/tool-logs?toolName=file.read");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(storage.getToolExecutionLogs).toHaveBeenCalledWith({ toolName: "file.read" });
  });

  it("GET /api/tool-logs?sessionId=s1 按会话 ID 筛选", async () => {
    const filtered = sampleLogs.filter((l) => l.sessionId === "s1");
    const storage = makeMockStorage({
      getToolExecutionLogs: vi.fn().mockResolvedValue(filtered),
    });
    const app = createToolLogsRoutes(storage);
    const res = await app.request("/api/tool-logs?sessionId=s1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(storage.getToolExecutionLogs).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("GET /api/tool-logs?toolName=file.read&sessionId=s1 同时按工具名称和会话 ID 筛选", async () => {
    const filtered = sampleLogs.filter((l) => l.toolName === "file.read" && l.sessionId === "s1");
    const storage = makeMockStorage({
      getToolExecutionLogs: vi.fn().mockResolvedValue(filtered),
    });
    const app = createToolLogsRoutes(storage);
    const res = await app.request("/api/tool-logs?toolName=file.read&sessionId=s1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(storage.getToolExecutionLogs).toHaveBeenCalledWith({
      toolName: "file.read",
      sessionId: "s1",
    });
  });

  it("GET /api/tool-logs 无日志时返回空数组", async () => {
    const storage = makeMockStorage();
    const app = createToolLogsRoutes(storage);
    const res = await app.request("/api/tool-logs");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
