import { describe, it, expect, vi } from "vitest";
import type { StorageService, ScheduledTask } from "@winches/storage";
import { createTasksRoutes } from "../server/routes/tasks.js";

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

const sampleTasks: ScheduledTask[] = [
  {
    id: "task-1",
    triggerAt: new Date("2024-06-01T10:00:00Z"),
    payload: "发送日报",
    status: "pending",
  },
  {
    id: "task-2",
    triggerAt: new Date("2024-06-02T12:00:00Z"),
    payload: "清理缓存",
    status: "pending",
  },
];

describe("tasks 路由", () => {
  it("GET /api/tasks 返回任务列表", async () => {
    const storage = makeMockStorage({
      getPendingTasks: vi.fn().mockResolvedValue(sampleTasks),
    });
    const app = createTasksRoutes(storage);
    const res = await app.request("/api/tasks");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("task-1");
    expect(body[1].id).toBe("task-2");
    expect(storage.getPendingTasks).toHaveBeenCalled();
  });

  it("GET /api/tasks 无任务时返回空数组", async () => {
    const storage = makeMockStorage();
    const app = createTasksRoutes(storage);
    const res = await app.request("/api/tasks");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("PATCH /api/tasks/:id 更新任务状态成功", async () => {
    const storage = makeMockStorage({
      updateTaskStatus: vi.fn().mockResolvedValue(undefined),
    });
    const app = createTasksRoutes(storage);
    const res = await app.request("/api/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(storage.updateTaskStatus).toHaveBeenCalledWith("task-1", "cancelled");
  });

  it("PATCH /api/tasks/:id 任务不存在返回 404", async () => {
    const storage = makeMockStorage({
      updateTaskStatus: vi.fn().mockRejectedValue(new Error("Task not found: no-such-task")),
    });
    const app = createTasksRoutes(storage);
    const res = await app.request("/api/tasks/no-such-task", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("Task not found");
  });
});
