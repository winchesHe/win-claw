import { resolve } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { StorageService } from "@winches/storage";
import { ConfigService } from "./services/config-service.js";
import { EnvService } from "./services/env-service.js";
import { LogService } from "./services/log-service.js";
import { PluginDiscoveryService } from "./services/plugin-discovery-service.js";
import { PluginConfigWriteService } from "./services/plugin-config-write-service.js";
import { McpTestService } from "./services/mcp-test-service.js";
import { createStatusRoutes } from "./routes/status.js";
import { createConfigRoutes } from "./routes/config.js";
import { createSessionsRoutes } from "./routes/sessions.js";
import { createToolLogsRoutes } from "./routes/tool-logs.js";
import { createLogsRoutes } from "./routes/logs.js";
import { createTasksRoutes } from "./routes/tasks.js";
import { createMemoriesRoutes } from "./routes/memories.js";
import { createPluginRoutes } from "./routes/plugins.js";

export interface CreateAppOptions {
  storage: StorageService;
  /** 项目根目录，用于定位 config.yaml / .env / data/ 等文件，默认 process.cwd() */
  rootDir?: string;
}

export function createApp(options: CreateAppOptions): Hono {
  const { storage, rootDir = process.cwd() } = options;
  const app = new Hono();

  const configService = new ConfigService(resolve(rootDir, "config.yaml"));
  const envService = new EnvService(resolve(rootDir, ".env"), resolve(rootDir, ".env.example"));
  const logService = new LogService(resolve(rootDir, "data/agent.log"));
  const pluginDiscoveryService = new PluginDiscoveryService(rootDir);
  const pluginConfigWriteService = new PluginConfigWriteService(rootDir);
  const mcpTestService = new McpTestService();

  // Register API routes
  app.route("", createStatusRoutes(storage));
  app.route("", createConfigRoutes(configService, envService));
  app.route("", createSessionsRoutes(storage));
  app.route("", createToolLogsRoutes(storage));
  app.route("", createLogsRoutes(logService));
  app.route("", createTasksRoutes(storage));
  app.route("", createMemoriesRoutes(storage));
  app.route(
    "",
    createPluginRoutes(pluginDiscoveryService, pluginConfigWriteService, mcpTestService),
  );

  // Global error handler
  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: message }, 500);
  });

  // Static file serving for assets
  app.use("/assets/*", serveStatic({ root: "./dist/client" }));

  // SPA fallback — non-API GET requests return index.html
  app.get("*", serveStatic({ root: "./dist/client", path: "index.html" }));

  return app;
}

export function startServer(options: CreateAppOptions & { port?: number }): void {
  const { port = 3000, ...appOptions } = options;
  const app = createApp(appOptions);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Web UI server running at http://localhost:${info.port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Error: Port ${port} is already in use`);
      process.exit(1);
    }
    throw err;
  });
}
