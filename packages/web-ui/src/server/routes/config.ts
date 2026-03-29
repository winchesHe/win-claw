import { Hono } from "hono";
import type { ConfigService } from "../services/config-service.js";
import type { EnvService } from "../services/env-service.js";
import { ConfigValidationError, UnknownEnvKeyError } from "../errors.js";

export function createConfigRoutes(configService: ConfigService, envService: EnvService) {
  const app = new Hono();

  app.get("/api/config", (c) => {
    const config = configService.getConfig();
    return c.json(config);
  });

  app.put("/api/config", async (c) => {
    try {
      const body = await c.req.json();
      configService.updateConfig(body);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof ConfigValidationError) {
        return c.json({ error: err.message, field: err.field }, 400);
      }
      throw err;
    }
  });

  app.get("/api/env", (c) => {
    const vars = envService.getEnvVars();
    return c.json(vars);
  });

  app.put("/api/env", async (c) => {
    try {
      const body = await c.req.json();
      envService.updateEnvVars(body);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof UnknownEnvKeyError) {
        return c.json({ error: err.message, invalidKeys: err.invalidKeys }, 400);
      }
      throw err;
    }
  });

  return app;
}
