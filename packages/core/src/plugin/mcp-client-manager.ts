import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import pino from "pino";
import type { McpServerConfig, McpServerStatus } from "./types.js";
import type { ToolRegistry } from "../registry.js";
import { McpConnectionError } from "./errors.js";
import { adaptMcpTools } from "./mcp-tool-adapter.js";
import type { McpTool, McpToolResult } from "./mcp-tool-adapter.js";

const logger = pino({ name: "@winches/core:plugin" });

interface ManagedClient {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  status: McpServerStatus;
}

export class McpClientManager {
  private clients: Map<string, ManagedClient> = new Map();

  /**
   * 根据配置连接所有 MCP Server，将工具注入 registry。
   * 单个 Server 连接失败不影响其余。
   */
  async connectAll(servers: McpServerConfig[], registry: ToolRegistry): Promise<void> {
    for (const serverConfig of servers) {
      try {
        await this.connectOne(serverConfig, registry);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ server: serverConfig.name, error: message }, "MCP server connection failed");

        this.clients.set(serverConfig.name, {
          client: null as unknown as Client,
          transport: null as unknown as StdioClientTransport,
          status: {
            name: serverConfig.name,
            status: "failed",
            toolCount: 0,
            error: message,
            source: serverConfig.source,
          },
        });
      }
    }
  }

  private async connectOne(config: McpServerConfig, registry: ToolRegistry): Promise<void> {
    let transport: StdioClientTransport | SSEClientTransport;

    if (config.transport === "stdio") {
      if (!config.command) {
        throw new McpConnectionError(config.name, "Missing command for stdio transport");
      }
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env ? ({ ...process.env, ...config.env } as Record<string, string>) : undefined,
      });
    } else if (config.transport === "sse") {
      if (!config.url) {
        throw new McpConnectionError(config.name, "Missing url for SSE transport");
      }
      transport = new SSEClientTransport(new URL(config.url));
    } else {
      throw new McpConnectionError(
        config.name,
        `Unsupported transport: ${config.transport as string}`,
      );
    }

    const client = new Client({ name: "winches-agent", version: "0.0.1" }, { capabilities: {} });
    await client.connect(transport);

    // Discover tools
    const toolsResponse = await client.listTools();
    const mcpTools: McpTool[] = (toolsResponse.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown> | undefined,
    }));

    // Create callTool callback
    const callTool = async (toolName: string, args: unknown): Promise<McpToolResult> => {
      const result = await client.callTool({
        name: toolName,
        arguments: args as Record<string, unknown>,
      });
      return result as unknown as McpToolResult;
    };

    // Adapt and register tools
    const adaptedTools = adaptMcpTools(config.name, mcpTools, callTool);
    for (const tool of adaptedTools) {
      try {
        registry.register(tool);
      } catch {
        // DuplicateToolError — skip silently, tool already registered
        logger.debug({ tool: tool.name }, "Tool already registered, skipping");
      }
    }

    const status: McpServerStatus = {
      name: config.name,
      status: "connected",
      toolCount: adaptedTools.length,
      source: config.source,
    };

    this.clients.set(config.name, { client, transport, status });
    logger.info({ server: config.name, toolCount: adaptedTools.length }, "MCP server connected");
  }

  /** 获取所有 MCP Server 的状态 */
  getStatus(): McpServerStatus[] {
    return Array.from(this.clients.values()).map((c) => c.status);
  }

  /** 关闭所有连接 */
  async disconnectAll(): Promise<void> {
    for (const [name, managed] of this.clients) {
      try {
        if (managed.client && managed.status.status === "connected") {
          await managed.client.close();
          managed.status.status = "disconnected";
          logger.info({ server: name }, "MCP server disconnected");
        }
      } catch (err) {
        logger.warn({ server: name, error: String(err) }, "Error disconnecting MCP server");
      }
    }
    this.clients.clear();
  }
}
