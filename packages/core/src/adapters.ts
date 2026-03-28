import type { ToolDefinition } from "@winches/ai";
import type { Tool, IToolRegistry } from "./types.js";

/** 将工具内部名称（如 file.list）转换为 LLM API 兼容名称（如 file-list） */
export function sanitizeToolName(name: string): string {
  return name.replace(/\./g, "-");
}

/** 将 LLM API 兼容名称（如 file-list）还原为工具内部名称（如 file.list） */
export function restoreToolName(name: string): string {
  return name.replace(/-/g, ".");
}

/** 将单个 Tool 转换为 @winches/ai ToolDefinition 格式 */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    name: sanitizeToolName(tool.name),
    description: tool.description,
    parameters: tool.parameters,
  };
}

/** 将 ToolRegistry 中所有工具批量转换为 ToolDefinition 数组 */
export function registryToToolDefinitions(registry: IToolRegistry): ToolDefinition[] {
  return registry.list().map(toToolDefinition);
}
