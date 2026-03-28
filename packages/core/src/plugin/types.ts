/** IDE 类型标识 */
export type IdeType = "cursor" | "claude" | "codex" | "kiro";

/** 配置来源 */
export interface ConfigSource {
  ideType: IdeType | "config-yaml";
  path: string;
  scope: "project" | "global" | "yaml";
}

/** MCP Server 配置 */
export interface McpServerConfig {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  source: ConfigSource;
}

/** Skill 配置（原始声明） */
export interface SkillConfig {
  name: string;
  description: string;
  prompt?: string;
  promptFile?: string;
  source: ConfigSource;
}

/** 合并后的最终插件配置 */
export interface PluginConfig {
  mcpServers: McpServerConfig[];
  skills: SkillConfig[];
  /** 配置来源摘要，用于日志 */
  sourceSummary: string[];
}

/** 已加载的 Skill 实例（prompt 已解析） */
export interface Skill {
  name: string;
  description: string;
  prompt: string;
  source: ConfigSource;
}

/** MCP Server 连接状态 */
export interface McpServerStatus {
  name: string;
  status: "connected" | "failed" | "disconnected";
  toolCount: number;
  error?: string;
  source: ConfigSource;
}

/** 配置验证错误 */
export interface ValidationError {
  path: string;
  message: string;
  source: string;
}

/** ConfigDiscovery 选项 */
export interface ConfigDiscoveryOptions {
  /** 项目根目录，默认 process.cwd() */
  projectRoot?: string;
  /** 用户主目录，默认 os.homedir() */
  homeDir?: string;
  /** config.yaml 路径，可选 */
  configYamlPath?: string;
}

/** SkillRegistry 公共接口（用于跨包类型兼容） */
export interface ISkillRegistry {
  loadAll(configs: SkillConfig[]): Promise<void>;
  get(name: string): Skill | undefined;
  list(): Skill[];
  renderPrompt(name: string, variables?: Record<string, string>): string | undefined;
}

/** McpClientManager 公共接口（用于跨包类型兼容） */
export interface IMcpClientManager {
  connectAll(
    servers: McpServerConfig[],
    registry: import("../types.js").IToolRegistry,
  ): Promise<void>;
  getStatus(): McpServerStatus[];
  disconnectAll(): Promise<void>;
}
