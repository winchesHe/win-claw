import { McpClientManager, ToolRegistry } from "@winches/core";
import type { McpServerConfig } from "@winches/core";
import type { McpConnectionTestResult } from "../types.js";

export class McpTestService {
  async testConnection(config: McpServerConfig): Promise<McpConnectionTestResult> {
    const registry = new ToolRegistry();
    const manager = new McpClientManager();

    try {
      await manager.connectAll([config], registry);
      const status = manager.getStatus()[0];
      if (!status || status.status !== "connected") {
        return {
          name: config.name,
          status: "failed",
          toolCount: status?.toolCount ?? 0,
          stage: "connection",
          message: "MCP server connection failed",
          error: status?.error ?? "Unknown MCP connection failure",
        };
      }

      return {
        name: config.name,
        status: "connected",
        toolCount: status.toolCount,
        stage: "discovery",
        message: `Connected successfully and discovered ${status.toolCount} tools`,
      };
    } finally {
      await manager.disconnectAll();
    }
  }
}
