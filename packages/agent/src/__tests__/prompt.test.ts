import { describe, it, expect } from "vitest";
import { buildMessages, buildSystemPrompt } from "../prompt.js";
import type { Message } from "@winches/ai";
import type { Memory } from "@winches/storage";
import { ToolRegistry } from "@winches/core";
import type { Tool } from "@winches/core";

function makeMemory(content: string): Memory {
  return {
    id: "mem-1",
    content,
    tags: [],
    createdAt: new Date(),
    importance: 0.5,
  };
}

describe("buildMessages", () => {
  it("消息顺序正确：system → history → current", () => {
    const history: Message[] = [{ role: "user", content: "历史消息" }];
    const current: Message[] = [{ role: "user", content: "当前消息" }];
    const result = buildMessages("系统提示", [], history, current);

    expect(result[0].role).toBe("system");
    expect(result[1]).toEqual(history[0]);
    expect(result[2]).toEqual(current[0]);
    expect(result).toHaveLength(3);
  });

  it("有记忆时注入 <memory> 标签", () => {
    const memories = [makeMemory("用户喜欢 vim"), makeMemory("工作目录 ~/projects")];
    const result = buildMessages("系统提示", memories, [], []);

    const systemContent = result[0].content as string;
    expect(systemContent).toContain("<memory>");
    expect(systemContent).toContain("用户喜欢 vim");
    expect(systemContent).toContain("工作目录 ~/projects");
    expect(systemContent).toContain("</memory>");
  });

  it("空记忆时不注入记忆区块", () => {
    const result = buildMessages("系统提示", [], [], []);

    const systemContent = result[0].content as string;
    expect(systemContent).not.toContain("<memory>");
    expect(systemContent).toBe("系统提示");
  });

  it("system 消息 role 为 'system'", () => {
    const result = buildMessages("系统提示", [], [], []);
    expect(result[0].role).toBe("system");
  });

  it("无历史无当前消息时只有 system 消息", () => {
    const result = buildMessages("系统提示", [], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("system");
  });

  it("记忆内容以换行分隔", () => {
    const memories = [makeMemory("记忆A"), makeMemory("记忆B")];
    const result = buildMessages("提示", memories, [], []);
    const systemContent = result[0].content as string;
    expect(systemContent).toContain("记忆A\n记忆B");
  });
});

function makeTool(overrides: Partial<Tool> & { name: string }): Tool {
  return {
    description: `${overrides.name} tool`,
    parameters: { type: "object", properties: {} },
    dangerLevel: "safe",
    execute: async () => ({ success: true, data: null }),
    ...overrides,
  };
}

function makeRegistry(tools: Tool[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

describe("buildSystemPrompt", () => {
  it("包含身份区块", () => {
    const result = buildSystemPrompt({ registry: new ToolRegistry() });
    expect(result).toContain("helpful personal assistant");
    expect(result).toContain("Always respond in 中文.");
  });

  it("使用自定义 homeDir", () => {
    const result = buildSystemPrompt({
      registry: new ToolRegistry(),
      homeDir: "/custom/home",
    });
    expect(result).toContain("/custom/home");
  });

  it("包含 Tooling 区块，列出注册的工具", () => {
    const registry = makeRegistry([
      makeTool({ name: "file.read", dangerLevel: "safe" }),
      makeTool({ name: "file.write", dangerLevel: "confirm" }),
      makeTool({ name: "shell.exec", dangerLevel: "dangerous" }),
    ]);
    const result = buildSystemPrompt({ registry });

    expect(result).toContain("## Tooling");
    expect(result).toContain("`file-read`");
    expect(result).toContain("`file-write`");
    expect(result).toContain("`shell-exec`");
    expect(result).toContain("Safe tools");
    expect(result).toContain("requiring confirmation");
    expect(result).toContain("Dangerous tools");
  });

  it("空注册表时不生成 Tooling 区块", () => {
    const result = buildSystemPrompt({ registry: new ToolRegistry() });
    expect(result).not.toContain("## Tooling");
  });

  it("包含 Tool Call Style 区块", () => {
    const result = buildSystemPrompt({ registry: new ToolRegistry() });
    expect(result).toContain("## Tool Call Style");
    expect(result).toContain("do NOT retry");
  });

  it("有 skillsPrompt 时包含 Skills 区块", () => {
    const result = buildSystemPrompt({
      registry: new ToolRegistry(),
      skillsPrompt: "<available_skills>\n- code-review: Review code\n</available_skills>",
    });
    expect(result).toContain("## Skills (mandatory)");
    expect(result).toContain("<available_skills>");
    expect(result).toContain("code-review");
  });

  it("无 skillsPrompt 时不包含 Skills 区块", () => {
    const result = buildSystemPrompt({ registry: new ToolRegistry() });
    expect(result).not.toContain("## Skills");
  });

  it("自定义 readToolName 出现在 Skills 区块", () => {
    const result = buildSystemPrompt({
      registry: new ToolRegistry(),
      skillsPrompt: "<available_skills>test</available_skills>",
      readToolName: "custom-read",
    });
    expect(result).toContain("`custom-read`");
  });

  it("包含 Workspace 区块", () => {
    const result = buildSystemPrompt({
      registry: new ToolRegistry(),
      cwd: "/projects/my-app",
    });
    expect(result).toContain("## Workspace");
    expect(result).toContain("/projects/my-app");
  });

  it("包含 workspaceGuidance 和 workspaceNotes", () => {
    const result = buildSystemPrompt({
      registry: new ToolRegistry(),
      workspaceGuidance: "Use pnpm for package management.",
      workspaceNotes: "Node.js 22+ required.",
    });
    expect(result).toContain("Use pnpm for package management.");
    expect(result).toContain("Node.js 22+ required.");
  });

  it("有 agentsMd 时包含 Agents.md 区块", () => {
    const result = buildSystemPrompt({
      registry: new ToolRegistry(),
      agentsMd: "# Project Guidelines\nFollow TDD.",
    });
    expect(result).toContain("## Agents.md");
    expect(result).toContain("Follow TDD.");
  });

  it("无 agentsMd 时不包含 Agents.md 区块", () => {
    const result = buildSystemPrompt({ registry: new ToolRegistry() });
    expect(result).not.toContain("## Agents.md");
  });

  it("区块顺序正确：Identity → Tooling → Tool Call Style → Skills → Workspace → Agents.md", () => {
    const registry = makeRegistry([makeTool({ name: "file.read" })]);
    const result = buildSystemPrompt({
      registry,
      skillsPrompt: "<available_skills>test</available_skills>",
      agentsMd: "guidelines",
      cwd: "/test",
    });

    const toolingIdx = result.indexOf("## Tooling");
    const styleIdx = result.indexOf("## Tool Call Style");
    const skillsIdx = result.indexOf("## Skills (mandatory)");
    const workspaceIdx = result.indexOf("## Workspace");
    const agentsIdx = result.indexOf("## Agents.md");

    expect(toolingIdx).toBeLessThan(styleIdx);
    expect(styleIdx).toBeLessThan(skillsIdx);
    expect(skillsIdx).toBeLessThan(workspaceIdx);
    expect(workspaceIdx).toBeLessThan(agentsIdx);
  });
});
