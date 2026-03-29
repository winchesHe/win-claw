import { Hono } from "hono";
import type { StorageService } from "@winches/storage";

export function createMemoriesRoutes(storage: StorageService) {
  const app = new Hono();

  app.get("/api/memories/summary", async (c) => {
    const summary = await storage.memorySummary();
    return c.json(summary);
  });

  app.get("/api/memories/search", async (c) => {
    const query = c.req.query("query");
    if (!query) {
      return c.json({ error: "query parameter is required" }, 400);
    }
    const results = await storage.recall(query);
    return c.json(results);
  });

  app.get("/api/memories", async (c) => {
    const memories = await storage.recall("", 100);
    return c.json(memories);
  });

  return app;
}
