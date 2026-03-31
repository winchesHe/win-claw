import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServerConfig } from "@winches/core";

const connectAllMock = vi.fn();
const disconnectAllMock = vi.fn();
const getStatusMock = vi.fn();
const getDiscoveredToolsMock = vi.fn();
const toolRegistryMock = vi.fn();

vi.mock("@winches/core", () => ({
  ToolRegistry: vi.fn().mockImplementation(() => {
    toolRegistryMock();
    return {};
  }),
  McpClientManager: vi.fn().mockImplementation(() => ({
    connectAll: connectAllMock,
    getStatus: getStatusMock,
    disconnectAll: disconnectAllMock,
    getDiscoveredTools: getDiscoveredToolsMock,
  })),
}));

describe("McpTestService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("连接成功时返回 discovered tools", async () => {
    connectAllMock.mockResolvedValue(undefined);
    getStatusMock.mockReturnValue([
      {
        name: "filesystem",
        status: "connected",
        toolCount: 2,
      },
    ]);
    getDiscoveredToolsMock.mockReturnValue([
      {
        name: "read_file",
        description: "Read a file from disk",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
        },
      },
      {
        name: "write_file",
        description: "Write content to a file",
      },
    ]);

    const { McpTestService } = await import("../server/services/mcp-test-service.js");
    const service = new McpTestService();
    const config: McpServerConfig = {
      name: "filesystem",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      source: {
        ideType: "codex",
        path: "/virtual/.codex/mcp.json",
        scope: "project",
      },
    };

    const result = await service.testConnection(config);

    expect(result).toEqual({
      name: "filesystem",
      status: "connected",
      toolCount: 2,
      stage: "discovery",
      message: "Connected successfully and discovered 2 tools",
      tools: [
        {
          name: "read_file",
          description: "Read a file from disk",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
          },
        },
        {
          name: "write_file",
          description: "Write content to a file",
        },
      ],
    });
    expect(connectAllMock).toHaveBeenCalledOnce();
    expect(disconnectAllMock).toHaveBeenCalledOnce();
  });
});
