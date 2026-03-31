import { afterEach, describe, expect, it, vi } from "vitest";
import { createPluginRoutes } from "../server/routes/plugins.js";
import { PluginValidationError } from "../server/errors.js";
import type { PluginConfigWriteService } from "../server/services/plugin-config-write-service.js";
import type { PluginDiscoveryService } from "../server/services/plugin-discovery-service.js";
import type { McpTestService } from "../server/services/mcp-test-service.js";

function makeMockPluginDiscoveryService(
  overrides: Partial<PluginDiscoveryService> = {},
): PluginDiscoveryService {
  return {
    listSkills: vi.fn().mockResolvedValue([
      {
        name: "brainstorming",
        description: "Explore ideas before implementation",
        activeSource: {
          name: "brainstorming",
          description: "Explore ideas before implementation",
          sourceLabel: "project:codex",
          scope: "project",
          ideType: "codex",
          path: "/repo/.codex/skills/brainstorming/SKILL.md",
          contentMode: "file",
          editable: true,
          active: true,
          issues: [],
        },
        sourceCount: 2,
        shadowedCount: 1,
      },
    ]),
    getSkill: vi.fn().mockResolvedValue({
      item: {
        name: "brainstorming",
        description: "Explore ideas before implementation",
        activeSource: {
          name: "brainstorming",
          description: "Explore ideas before implementation",
          sourceLabel: "project:codex",
          scope: "project",
          ideType: "codex",
          path: "/repo/.codex/skills/brainstorming/SKILL.md",
          contentMode: "file",
          editable: true,
          active: true,
          issues: [],
        },
        sourceCount: 2,
        shadowedCount: 1,
      },
      sources: [
        {
          name: "brainstorming",
          description: "Explore ideas before implementation",
          sourceLabel: "project:codex",
          scope: "project",
          ideType: "codex",
          path: "/repo/.codex/skills/brainstorming/SKILL.md",
          contentMode: "file",
          editable: true,
          active: true,
          issues: [],
        },
        {
          name: "brainstorming",
          description: "Global version",
          sourceLabel: "global:codex",
          scope: "global",
          ideType: "codex",
          path: "/home/.codex/skills/brainstorming/SKILL.md",
          contentMode: "file",
          editable: false,
          active: false,
          shadowedBy: "project:codex",
          issues: [],
        },
      ],
      preview: "Skill preview",
    }),
    listMcpServers: vi.fn().mockResolvedValue([
      {
        name: "filesystem",
        activeSource: {
          name: "filesystem",
          transport: "stdio",
          command: "node",
          args: ["server.js"],
          envKeys: ["ROOT_DIR"],
          sourceLabel: "project:codex",
          scope: "project",
          ideType: "codex",
          editable: true,
          active: true,
          issues: [],
        },
        status: "unknown",
        toolCount: null,
        sourceCount: 2,
        shadowedCount: 1,
      },
    ]),
    getMcpServer: vi.fn().mockResolvedValue({
      item: {
        name: "filesystem",
        activeSource: {
          name: "filesystem",
          transport: "stdio",
          command: "node",
          args: ["server.js"],
          envKeys: ["ROOT_DIR"],
          sourceLabel: "project:codex",
          scope: "project",
          ideType: "codex",
          editable: true,
          active: true,
          issues: [],
        },
        status: "unknown",
        toolCount: null,
        sourceCount: 2,
        shadowedCount: 1,
      },
      sources: [
        {
          name: "filesystem",
          transport: "stdio",
          command: "node",
          args: ["server.js"],
          envKeys: ["ROOT_DIR"],
          sourceLabel: "project:codex",
          scope: "project",
          ideType: "codex",
          editable: true,
          active: true,
          issues: [],
        },
        {
          name: "filesystem",
          transport: "stdio",
          command: "uvx",
          args: ["mcp-server-filesystem"],
          envKeys: [],
          sourceLabel: "yaml:config-yaml",
          scope: "yaml",
          ideType: "config-yaml",
          editable: false,
          active: false,
          shadowedBy: "project:codex",
          issues: [],
        },
      ],
    }),
    getSources: vi.fn().mockReturnValue({
      discoveredSources: [
        {
          sourceLabel: "project:codex",
          scope: "project",
          ideType: "codex",
          path: "/repo/.codex",
        },
      ],
      writableTargets: [
        {
          kind: "ide-skill-file",
          label: "Project Codex Skills",
          path: "/repo/.codex/skills",
          ideType: "codex",
        },
      ],
    }),
    ...overrides,
  } as unknown as PluginDiscoveryService;
}

function makeMockPluginConfigWriteService(
  overrides: Partial<PluginConfigWriteService> = {},
): PluginConfigWriteService {
  return {
    upsertSkill: vi.fn(),
    deleteSkill: vi.fn(),
    upsertMcpServer: vi.fn(),
    deleteMcpServer: vi.fn(),
    ...overrides,
  } as unknown as PluginConfigWriteService;
}

function makeMockMcpTestService(overrides: Partial<McpTestService> = {}): McpTestService {
  return {
    testConnection: vi.fn().mockResolvedValue({
      name: "filesystem",
      status: "connected",
      toolCount: 3,
      stage: "discovery",
      message: "Connected successfully and discovered 3 tools",
      tools: [
        {
          name: "read_file",
          description: "Read a file from disk",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
            required: ["path"],
          },
        },
        {
          name: "write_file",
          description: "Write content to a file",
        },
      ],
    }),
    ...overrides,
  } as unknown as McpTestService;
}

describe("plugins 路由", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/plugins/skills 返回 skills 列表", async () => {
    const service = makeMockPluginDiscoveryService();
    const app = createPluginRoutes(service);

    const res = await app.request("/api/plugins/skills");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("brainstorming");
    expect(body[0].shadowedCount).toBe(1);
    expect(service.listSkills).toHaveBeenCalled();
  });

  it("GET /api/plugins/skills/:name 返回详情与 shadowed 来源", async () => {
    const service = makeMockPluginDiscoveryService();
    const app = createPluginRoutes(service);

    const res = await app.request("/api/plugins/skills/brainstorming");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.name).toBe("brainstorming");
    expect(body.sources).toHaveLength(2);
    expect(body.sources[1].shadowedBy).toBe("project:codex");
  });

  it("GET /api/plugins/mcp 返回 server 列表，缺少运行态时 status 为 unknown", async () => {
    const service = makeMockPluginDiscoveryService();
    const app = createPluginRoutes(service);

    const res = await app.request("/api/plugins/mcp");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("filesystem");
    expect(body[0].status).toBe("unknown");
    expect(body[0].toolCount).toBeNull();
  });

  it("GET /api/plugins/mcp/:name 返回来源详情", async () => {
    const service = makeMockPluginDiscoveryService();
    const app = createPluginRoutes(service);

    const res = await app.request("/api/plugins/mcp/filesystem");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.name).toBe("filesystem");
    expect(body.sources[1].sourceLabel).toBe("yaml:config-yaml");
    expect(body.sources[1].shadowedBy).toBe("project:codex");
  });

  it("GET /api/plugins/sources 返回来源摘要和可写目标", async () => {
    const service = makeMockPluginDiscoveryService();
    const app = createPluginRoutes(service);

    const res = await app.request("/api/plugins/sources");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.discoveredSources).toHaveLength(1);
    expect(body.writableTargets).toHaveLength(1);
    expect(body.writableTargets[0].ideType).toBe("codex");
  });

  it("详情不存在时返回 404", async () => {
    const service = makeMockPluginDiscoveryService({
      getSkill: vi.fn().mockResolvedValue(null),
      getMcpServer: vi.fn().mockResolvedValue(null),
    });
    const app = createPluginRoutes(service);

    const skillRes = await app.request("/api/plugins/skills/missing");
    const mcpRes = await app.request("/api/plugins/mcp/missing");

    expect(skillRes.status).toBe(404);
    expect(mcpRes.status).toBe(404);
  });

  it("POST /api/plugins/skills 调用写入服务", async () => {
    const discovery = makeMockPluginDiscoveryService();
    const writer = makeMockPluginConfigWriteService();
    const app = createPluginRoutes(discovery, writer);

    const res = await app.request("/api/plugins/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-skill", description: "desc", body: "body" }),
    });

    expect(res.status).toBe(200);
    expect(writer.upsertSkill).toHaveBeenCalledWith({
      name: "my-skill",
      description: "desc",
      body: "body",
    });
  });

  it("PUT /api/plugins/mcp 参数非法时返回 400", async () => {
    const discovery = makeMockPluginDiscoveryService();
    const writer = makeMockPluginConfigWriteService({
      upsertMcpServer: vi.fn().mockImplementation(() => {
        throw new PluginValidationError("command", "is required for stdio transport");
      }),
    });
    const app = createPluginRoutes(discovery, writer);

    const res = await app.request("/api/plugins/mcp/filesystem", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transport: "stdio" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("command");
  });

  it("DELETE /api/plugins/skills 和 /api/plugins/mcp 返回 200", async () => {
    const discovery = makeMockPluginDiscoveryService();
    const writer = makeMockPluginConfigWriteService();
    const app = createPluginRoutes(discovery, writer);

    const skillRes = await app.request("/api/plugins/skills/my-skill", { method: "DELETE" });
    const mcpRes = await app.request("/api/plugins/mcp/filesystem", { method: "DELETE" });

    expect(skillRes.status).toBe(200);
    expect(mcpRes.status).toBe(200);
    expect(writer.deleteSkill).toHaveBeenCalledWith("my-skill");
    expect(writer.deleteMcpServer).toHaveBeenCalledWith("filesystem");
  });

  it("POST /api/plugins/mcp/test 返回连接测试结果", async () => {
    const discovery = makeMockPluginDiscoveryService();
    const writer = makeMockPluginConfigWriteService();
    const tester = makeMockMcpTestService();
    const app = createPluginRoutes(discovery, writer, tester);

    const res = await app.request("/api/plugins/mcp/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "filesystem",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("connected");
    expect(body.toolCount).toBe(3);
    expect(body.tools).toEqual([
      {
        name: "read_file",
        description: "Read a file from disk",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
      },
      {
        name: "write_file",
        description: "Write content to a file",
      },
    ]);
    expect(tester.testConnection).toHaveBeenCalled();
  });
});
