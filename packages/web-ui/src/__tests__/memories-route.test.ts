import { describe, it, expect, vi } from "vitest";
import type { StorageService, Memory, MemorySummary } from "@winches/storage";
import { createMemoriesRoutes } from "../server/routes/memories.js";

function makeMockStorage(overrides: Partial<StorageService> = {}): StorageService {
  return {
    saveMessage: vi.fn(),
    getHistory: vi.fn(),
    searchHistory: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
    remember: vi.fn(),
    recall: vi.fn().mockResolvedValue([]),
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

const sampleSummary: MemorySummary = {
  longTerm: { count: 42, avgImportance: 0.75 },
  working: { count: 5, activeCount: 3 },
  episodic: { totalMessages: 200, vectorizedCount: 180 },
};

const sampleMemories: Memory[] = [
  {
    id: "m1",
    content: "用户喜欢 TypeScript",
    tags: ["preference", "language"],
    createdAt: new Date("2024-01-01"),
    importance: 0.8,
  },
  {
    id: "m2",
    content: "项目使用 pnpm workspaces",
    tags: ["project", "tooling"],
    createdAt: new Date("2024-01-02"),
    importance: 0.6,
  },
];

describe("memories 路由", () => {
  it("GET /api/memories/summary 返回记忆统计概览", async () => {
    const storage = makeMockStorage({
      memorySummary: vi.fn().mockResolvedValue(sampleSummary),
    });
    const app = createMemoriesRoutes(storage);
    const res = await app.request("/api/memories/summary");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(sampleSummary);
    expect(storage.memorySummary).toHaveBeenCalled();
  });

  it("GET /api/memories 返回长期记忆列表", async () => {
    const storage = makeMockStorage({
      recall: vi.fn().mockResolvedValue(sampleMemories),
    });
    const app = createMemoriesRoutes(storage);
    const res = await app.request("/api/memories");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(storage.recall).toHaveBeenCalledWith("", 100);
  });

  it("GET /api/memories/search?query=test 返回搜索结果", async () => {
    const searchResults = [sampleMemories[0]];
    const storage = makeMockStorage({
      recall: vi.fn().mockResolvedValue(searchResults),
    });
    const app = createMemoriesRoutes(storage);
    const res = await app.request("/api/memories/search?query=TypeScript");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(storage.recall).toHaveBeenCalledWith("TypeScript");
  });

  it("GET /api/memories/search 缺少 query 参数返回 400", async () => {
    const storage = makeMockStorage();
    const app = createMemoriesRoutes(storage);
    const res = await app.request("/api/memories/search");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET /api/memories 无记忆时返回空数组", async () => {
    const storage = makeMockStorage();
    const app = createMemoriesRoutes(storage);
    const res = await app.request("/api/memories");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
