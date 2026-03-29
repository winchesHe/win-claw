import { describe, it, expect, vi } from "vitest";
import { createLogsRoutes } from "../server/routes/logs.js";
import type { LogService } from "../server/services/log-service.js";
import type { LogEntry } from "../server/types.js";

function makeMockLogService(overrides: Partial<LogService> = {}): LogService {
  return {
    getLogs: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as LogService;
}

const sampleLogs: LogEntry[] = [
  { timestamp: "2024-01-01T00:00:00.000Z", level: 30, levelLabel: "info", msg: "Server started" },
  { timestamp: "2024-01-01T00:01:00.000Z", level: 40, levelLabel: "warn", msg: "Slow query" },
  { timestamp: "2024-01-01T00:02:00.000Z", level: 50, levelLabel: "error", msg: "Connection lost" },
];

describe("logs 路由", () => {
  it("GET /api/logs 返回日志列表", async () => {
    const logService = makeMockLogService({
      getLogs: vi.fn().mockReturnValue(sampleLogs),
    });
    const app = createLogsRoutes(logService);
    const res = await app.request("/api/logs");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(3);
    expect(logService.getLogs).toHaveBeenCalledWith({});
  });

  it("GET /api/logs?level=warn 按级别筛选", async () => {
    const filtered = sampleLogs.filter((l) => l.level >= 40);
    const logService = makeMockLogService({
      getLogs: vi.fn().mockReturnValue(filtered),
    });
    const app = createLogsRoutes(logService);
    const res = await app.request("/api/logs?level=warn");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(logService.getLogs).toHaveBeenCalledWith({ level: "warn" });
  });

  it("日志文件不存在时返回 404", async () => {
    const logService = makeMockLogService({
      getLogs: vi.fn().mockImplementation(() => {
        throw new Error("Log file not found: data/agent.log");
      }),
    });
    const app = createLogsRoutes(logService);
    const res = await app.request("/api/logs");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Log file not found: data/agent.log" });
  });
});
