import { CoreError } from "../errors.js";
import type { ValidationError } from "./types.js";

/** 插件模块通用错误 */
export class PluginError extends CoreError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PluginError";
  }
}

/** 插件配置验证错误，携带所有验证错误列表 */
export class PluginConfigValidationError extends PluginError {
  public readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const summary = errors.map((e) => `  - [${e.path}] ${e.message} (source: ${e.source})`);
    super(`Plugin config validation failed with ${errors.length} error(s):\n${summary.join("\n")}`);
    this.name = "PluginConfigValidationError";
    this.errors = errors;
  }
}

/** MCP Server 连接错误 */
export class McpConnectionError extends PluginError {
  public readonly serverName: string;

  constructor(serverName: string, message: string, options?: { cause?: unknown }) {
    super(`MCP server "${serverName}": ${message}`, options);
    this.name = "McpConnectionError";
    this.serverName = serverName;
  }
}
