import { Hono } from "hono";
import type { LogService } from "../services/log-service.js";

export function createLogsRoutes(logService: LogService) {
  const app = new Hono();

  app.get("/api/logs", (c) => {
    const level = c.req.query("level");
    const options: { level?: string } = {};
    if (level) options.level = level;

    try {
      const logs = logService.getLogs(options);
      return c.json(logs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read logs";
      return c.json({ error: message }, 404);
    }
  });

  return app;
}
