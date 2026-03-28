import type { Tool, ToolResult, JSONSchema } from "../types.js";

/** MCP 工具的原始定义（来自 MCP SDK tools/list 响应） */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** MCP 工具调用结果 */
export interface McpToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * 将 MCP 工具列表转换为 @winches/core Tool 数组。
 *
 * 命名规则：mcp.{serverName}.{toolName}
 * 所有 MCP 工具 dangerLevel 默认为 safe。
 * execute 方法通过 callTool 回调转发调用请求。
 * MCP Server 错误转换为 { success: false, error: string }。
 */
export function adaptMcpTools(
  serverName: string,
  mcpTools: McpTool[],
  callTool: (name: string, args: unknown) => Promise<McpToolResult>,
): Tool[] {
  return mcpTools.map((mcpTool) => ({
    name: `mcp.${serverName}.${mcpTool.name}`,
    description: mcpTool.description ?? "",
    parameters: (mcpTool.inputSchema as JSONSchema) ?? { type: "object" },
    dangerLevel: "safe" as const,
    async execute(params: unknown): Promise<ToolResult> {
      try {
        const result = await callTool(mcpTool.name, params);
        const text = result.content
          .map((c) => c.text ?? "")
          .filter(Boolean)
          .join("\n");

        if (result.isError) {
          return { success: false, error: text || "Unknown MCP tool error" };
        }

        return { success: true, data: text };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    },
  }));
}
