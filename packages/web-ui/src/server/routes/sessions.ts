import { Hono } from "hono";
import type { StorageService } from "@winches/storage";

export function createSessionsRoutes(storage: StorageService) {
  const app = new Hono();

  app.get("/api/sessions", async (c) => {
    const sessions = await storage.listSessions();
    sessions.sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
    );
    return c.json(sessions);
  });

  app.get("/api/sessions/:id/messages", async (c) => {
    const id = c.req.param("id");
    const messages = await storage.getHistory(id);
    return c.json(messages);
  });

  return app;
}
