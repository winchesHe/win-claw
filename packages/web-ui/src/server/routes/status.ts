import { Hono } from "hono";
import type { StorageService } from "@winches/storage";
import type { SystemStatus } from "../types.js";

export function createStatusRoutes(storage: StorageService) {
  const app = new Hono();

  app.get("/api/status", async (c) => {
    const [sessions, recentSessions, summary, pendingTasks, recentToolLogs] = await Promise.all([
      storage.listSessions(),
      storage.listSessions(1),
      storage.memorySummary(),
      storage.getPendingTasks(),
      storage.getToolExecutionLogs({ limit: 10 }),
    ]);

    const status: SystemStatus = {
      sessionCount: sessions.length,
      recentSession: recentSessions[0] ?? null,
      memoryCount: summary.longTerm.count,
      pendingTaskCount: pendingTasks.length,
      recentToolLogs,
    };

    return c.json(status);
  });

  return app;
}
