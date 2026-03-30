import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginValidationError } from "../server/errors.js";
import { PluginConfigWriteService } from "../server/services/plugin-config-write-service.js";

describe("PluginConfigWriteService", () => {
  let tempDir: string;
  let service: PluginConfigWriteService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "plugin-write-test-"));
    service = new PluginConfigWriteService(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("应写入项目级 skill 文件", () => {
    service.upsertSkill({
      name: "my-skill",
      description: "test skill",
      body: "Skill body",
    });

    const path = join(tempDir, ".codex", "skills", "my-skill", "SKILL.md");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    expect(raw).toContain("name: my-skill");
    expect(raw).toContain("description: test skill");
    expect(raw).toContain("Skill body");
  });

  it("应删除项目级 skill 目录", () => {
    service.upsertSkill({
      name: "my-skill",
      description: "test skill",
      body: "Skill body",
    });

    service.deleteSkill("my-skill");

    const path = join(tempDir, ".codex", "skills", "my-skill", "SKILL.md");
    expect(existsSync(path)).toBe(false);
  });

  it("应写入项目级 mcp.json", () => {
    service.upsertMcpServer({
      name: "filesystem",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { ROOT_DIR: "/tmp" },
    });

    const path = join(tempDir, ".codex", "mcp.json");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf-8");
    expect(raw).toContain('"filesystem"');
    expect(raw).toContain('"command": "node"');
    expect(raw).toContain('"ROOT_DIR": "/tmp"');
  });

  it("应删除 mcp server 条目", () => {
    service.upsertMcpServer({
      name: "filesystem",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    service.deleteMcpServer("filesystem");

    const path = join(tempDir, ".codex", "mcp.json");
    const raw = readFileSync(path, "utf-8");
    expect(raw).not.toContain('"filesystem"');
  });

  it("skill 名称非法时抛出 PluginValidationError", () => {
    expect(() => service.upsertSkill({ name: "Bad Name", description: "", body: "body" })).toThrow(
      PluginValidationError,
    );
  });

  it("stdio 模式缺少 command 时抛出 PluginValidationError", () => {
    expect(() => service.upsertMcpServer({ name: "filesystem", transport: "stdio" })).toThrow(
      PluginValidationError,
    );
  });
});
