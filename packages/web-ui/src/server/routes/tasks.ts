import { Hono } from "hono";
import type { StorageService } from "@winches/storage";

export function createTasksRoutes(storage: StorageService) {
  const app = new Hono();

  app.get("/api/tasks", async (c) => {
    const tasks = await storage.getPendingTasks();
    return c.json(tasks);
  });

  app.patch("/api/tasks/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ status: "completed" | "cancelled" }>();

    try {
      await storage.updateTaskStatus(id, body.status);
      return c.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Task not found";
      return c.json({ error: message }, 404);
    }
  });

  return app;
}
