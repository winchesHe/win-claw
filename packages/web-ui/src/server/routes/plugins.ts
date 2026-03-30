import { Hono } from "hono";
import { PluginValidationError } from "../errors.js";
import type { PluginDiscoveryService } from "../services/plugin-discovery-service.js";
import type { PluginConfigWriteService } from "../services/plugin-config-write-service.js";
import type { McpTestService } from "../services/mcp-test-service.js";

export function createPluginRoutes(
  pluginDiscoveryService: PluginDiscoveryService,
  pluginConfigWriteService?: PluginConfigWriteService,
  mcpTestService?: McpTestService,
) {
  const app = new Hono();

  app.get("/api/plugins/skills", async (c) => {
    const skills = await pluginDiscoveryService.listSkills();
    return c.json(skills);
  });

  app.get("/api/plugins/skills/:name", async (c) => {
    const detail = await pluginDiscoveryService.getSkill(c.req.param("name"));
    if (!detail) {
      return c.json({ error: "Skill not found" }, 404);
    }
    return c.json(detail);
  });

  app.get("/api/plugins/mcp", async (c) => {
    const servers = await pluginDiscoveryService.listMcpServers();
    return c.json(servers);
  });

  app.get("/api/plugins/mcp/:name", async (c) => {
    const detail = await pluginDiscoveryService.getMcpServer(c.req.param("name"));
    if (!detail) {
      return c.json({ error: "MCP server not found" }, 404);
    }
    return c.json(detail);
  });

  app.get("/api/plugins/sources", (c) => {
    return c.json(pluginDiscoveryService.getSources());
  });

  app.post("/api/plugins/skills", async (c) => {
    try {
      const body = await c.req.json();
      pluginConfigWriteService?.upsertSkill(body);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof PluginValidationError) {
        return c.json({ error: err.message, field: err.field }, 400);
      }
      throw err;
    }
  });

  app.put("/api/plugins/skills/:name", async (c) => {
    try {
      const body = await c.req.json();
      pluginConfigWriteService?.upsertSkill({ ...body, name: c.req.param("name") });
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof PluginValidationError) {
        return c.json({ error: err.message, field: err.field }, 400);
      }
      throw err;
    }
  });

  app.delete("/api/plugins/skills/:name", (c) => {
    pluginConfigWriteService?.deleteSkill(c.req.param("name"));
    return c.json({ ok: true });
  });

  app.post("/api/plugins/mcp", async (c) => {
    try {
      const body = await c.req.json();
      pluginConfigWriteService?.upsertMcpServer(body);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof PluginValidationError) {
        return c.json({ error: err.message, field: err.field }, 400);
      }
      throw err;
    }
  });

  app.put("/api/plugins/mcp/:name", async (c) => {
    try {
      const body = await c.req.json();
      pluginConfigWriteService?.upsertMcpServer({ ...body, name: c.req.param("name") });
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof PluginValidationError) {
        return c.json({ error: err.message, field: err.field }, 400);
      }
      throw err;
    }
  });

  app.delete("/api/plugins/mcp/:name", (c) => {
    pluginConfigWriteService?.deleteMcpServer(c.req.param("name"));
    return c.json({ ok: true });
  });

  app.post("/api/plugins/mcp/test", async (c) => {
    try {
      const body = await c.req.json();
      const result = await mcpTestService?.testConnection({
        ...body,
        source: {
          ideType: "codex",
          path: "/virtual/.codex/mcp.json",
          scope: "project",
        },
      });
      return c.json(
        result ?? { status: "failed", toolCount: 0, error: "Test service unavailable" },
        200,
      );
    } catch (err) {
      if (err instanceof PluginValidationError) {
        return c.json({ error: err.message, field: err.field }, 400);
      }
      throw err;
    }
  });

  return app;
}
