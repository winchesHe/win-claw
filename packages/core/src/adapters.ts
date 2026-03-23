import type { ToolDefinition } from "@winches/ai";
import type { Tool } from "./types.js";
import type { ToolRegistry } from "./registry.js";

/** 将单个 Tool 转换为 @winches/ai ToolDefinition 格式 */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

/** 将 ToolRegistry 中所有工具批量转换为 ToolDefinition 数组 */
export function registryToToolDefinitions(registry: ToolRegistry): ToolDefinition[] {
  return registry.list().map(toToolDefinition);
}
