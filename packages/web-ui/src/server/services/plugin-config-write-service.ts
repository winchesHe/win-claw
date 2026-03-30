import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PluginValidationError } from "../errors.js";

interface SkillMutationInput {
  name: string;
  description: string;
  body: string;
}

interface McpMutationInput {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export class PluginConfigWriteService {
  constructor(private readonly rootDir: string) {}

  upsertSkill(input: SkillMutationInput): void {
    this.validateSkill(input);
    const skillDir = resolve(this.rootDir, ".codex", "skills", input.name);
    const skillPath = join(skillDir, "SKILL.md");
    mkdirSync(skillDir, { recursive: true });

    const content = [
      "---",
      `name: ${input.name}`,
      `description: ${input.description}`,
      "---",
      "",
      input.body.trim(),
      "",
    ].join("\n");

    atomicWrite(skillPath, content);
  }

  deleteSkill(name: string): void {
    const skillDir = resolve(this.rootDir, ".codex", "skills", name);
    rmSync(skillDir, { recursive: true, force: true });
  }

  upsertMcpServer(input: McpMutationInput): void {
    this.validateMcp(input);
    const mcpPath = resolve(this.rootDir, ".codex", "mcp.json");
    const current = existsSync(mcpPath)
      ? ((JSON.parse(readFileSync(mcpPath, "utf-8")) as Record<string, unknown>) ?? {})
      : {};
    const mcpServers = ((current.mcpServers as Record<string, unknown>) ?? {}) as Record<
      string,
      Record<string, unknown>
    >;

    const server: Record<string, unknown> = {
      transport: input.transport,
    };
    if (input.command) server.command = input.command;
    if (input.args && input.args.length > 0) server.args = input.args;
    if (input.url) server.url = input.url;
    if (input.env && Object.keys(input.env).length > 0) server.env = input.env;

    mcpServers[input.name] = server;
    current.mcpServers = mcpServers;

    mkdirSync(dirname(mcpPath), { recursive: true });
    atomicWrite(mcpPath, `${JSON.stringify(current, null, 2)}\n`);
  }

  deleteMcpServer(name: string): void {
    const mcpPath = resolve(this.rootDir, ".codex", "mcp.json");
    if (!existsSync(mcpPath)) return;
    const current = JSON.parse(readFileSync(mcpPath, "utf-8")) as Record<string, unknown>;
    const mcpServers = ((current.mcpServers as Record<string, unknown>) ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    delete mcpServers[name];
    current.mcpServers = mcpServers;
    atomicWrite(mcpPath, `${JSON.stringify(current, null, 2)}\n`);
  }

  private validateSkill(input: SkillMutationInput): void {
    if (!input.name.trim()) {
      throw new PluginValidationError("name", "must not be empty");
    }
    if (!/^[a-z0-9-]+$/.test(input.name)) {
      throw new PluginValidationError(
        "name",
        "must contain only lowercase letters, numbers, and hyphens",
      );
    }
    if (!input.body.trim()) {
      throw new PluginValidationError("body", "must not be empty");
    }
  }

  private validateMcp(input: McpMutationInput): void {
    if (!input.name.trim()) {
      throw new PluginValidationError("name", "must not be empty");
    }
    if (input.transport === "stdio" && !input.command?.trim()) {
      throw new PluginValidationError("command", "is required for stdio transport");
    }
    if (input.transport === "sse" && !input.url?.trim()) {
      throw new PluginValidationError("url", "is required for sse transport");
    }
  }
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp.${Date.now()}`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, path);
}
