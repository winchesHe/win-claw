// Types
export type {
  Tool,
  ToolResult,
  DangerLevel,
  JSONSchema,
  FileEntry,
  IToolRegistry,
} from "./types.js";

// Registry
export { ToolRegistry, createDefaultRegistry } from "./registry.js";

// Adapters
export {
  toToolDefinition,
  registryToToolDefinitions,
  sanitizeToolName,
  restoreToolName,
} from "./adapters.js";

// Errors
export { CoreError, DuplicateToolError, ToolParamError } from "./errors.js";

// Plugin — Types
export type {
  PluginConfig,
  McpServerConfig,
  SkillConfig,
  Skill,
  McpServerStatus,
  ValidationError,
  ConfigSource,
  IdeType,
  ConfigDiscoveryOptions,
  ISkillRegistry,
  IMcpClientManager,
} from "./plugin/types.js";

// Plugin — Classes
export { McpClientManager } from "./plugin/mcp-client-manager.js";
export { SkillRegistry } from "./plugin/skill-registry.js";

// Plugin — Functions
export { discoverPluginConfig } from "./plugin/config-discovery.js";
export { validatePluginConfig } from "./plugin/config-validator.js";
export { adaptMcpTools } from "./plugin/mcp-tool-adapter.js";

// Plugin — Errors
export { PluginError, PluginConfigValidationError, McpConnectionError } from "./plugin/errors.js";
