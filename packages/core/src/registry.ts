import pino from "pino";
import type { Tool, DangerLevel } from "./types.js";
import { DuplicateToolError } from "./errors.js";
import { fileTools } from "./tools/file.js";
import { shellTools } from "./tools/shell.js";

const logger = pino({ name: "@winches/core" });

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new DuplicateToolError(tool.name);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listByDangerLevel(level: DangerLevel): Tool[] {
    return this.list().filter((tool) => tool.dangerLevel === level);
  }
}

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  const allTools = [...fileTools, ...shellTools];
  for (const tool of allTools) {
    registry.register(tool);
  }
  logger.info({ toolCount: allTools.length }, "ToolRegistry initialized");
  return registry;
}
