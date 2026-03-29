import { Hono } from "hono";
import type { StorageService } from "@winches/storage";

export function createToolLogsRoutes(storage: StorageService) {
  const app = new Hono();

  app.get("/api/tool-logs", async (c) => {
    const toolName = c.req.query("toolName");
    const sessionId = c.req.query("sessionId");
    const filter: { toolName?: string; sessionId?: string } = {};
    if (toolName) filter.toolName = toolName;
    if (sessionId) filter.sessionId = sessionId;
    const logs = await storage.getToolExecutionLogs(filter);
    return c.json(logs);
  });

  return app;
}
