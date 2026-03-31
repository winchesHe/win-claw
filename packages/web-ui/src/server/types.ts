import type { SessionInfo, ToolExecutionLog } from "@winches/storage";

// Re-export for convenience
export type { SessionInfo, ToolExecutionLog };

/** config.yaml 解析后的配置结构 */
export interface AppConfig {
  llm: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl: string | null;
  };
  embedding: {
    provider: string;
    model: string;
  };
  telegram: {
    botToken: string;
  };
  approval: {
    timeout: number;
    defaultAction: "reject" | "approve";
  };
  storage: {
    dbPath: string;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
}

/** .env 变量展示模型 */
export interface EnvVar {
  key: string;
  maskedValue: string;
  isSet: boolean;
  inExample: boolean;
}

/** pino 日志条目 */
export interface LogEntry {
  timestamp: string;
  level: number;
  levelLabel: string;
  msg: string;
  [key: string]: unknown;
}

/** 系统状态概览 */
export interface SystemStatus {
  sessionCount: number;
  recentSession: SessionInfo | null;
  memoryCount: number;
  pendingTaskCount: number;
  recentToolLogs: ToolExecutionLog[];
}

export type PluginScope = "project" | "global" | "yaml";
export type PluginIdeType = "cursor" | "claude" | "codex" | "kiro" | "config-yaml";

export interface SkillSourceView {
  name: string;
  description: string;
  sourceLabel: string;
  scope: PluginScope;
  ideType: PluginIdeType;
  path?: string;
  contentMode: "inline" | "file";
  editable: boolean;
  active: boolean;
  shadowedBy?: string;
  issues: string[];
}

export interface SkillListItemView {
  name: string;
  description: string;
  activeSource: SkillSourceView;
  sourceCount: number;
  shadowedCount: number;
}

export interface SkillDetailView {
  item: SkillListItemView;
  sources: SkillSourceView[];
  preview?: string;
}

export interface McpSourceView {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  envKeys: string[];
  env?: Record<string, string>;
  sourceLabel: string;
  scope: PluginScope;
  ideType: PluginIdeType;
  editable: boolean;
  active: boolean;
  shadowedBy?: string;
  issues: string[];
}

export interface McpListItemView {
  name: string;
  activeSource: McpSourceView;
  status: "connected" | "failed" | "disconnected" | "unknown";
  toolCount: number | null;
  error?: string;
  sourceCount: number;
  shadowedCount: number;
}

export interface McpDetailView {
  item: McpListItemView;
  sources: McpSourceView[];
}

export interface WritablePluginTarget {
  kind: "yaml-skill" | "ide-skill-file" | "yaml-mcp" | "ide-mcp-json";
  label: string;
  path: string;
  ideType?: Exclude<PluginIdeType, "config-yaml">;
}

export interface PluginSourceSummaryView {
  sourceLabel: string;
  scope: PluginScope;
  ideType: PluginIdeType;
  path: string;
}

export interface PluginSourcesResponse {
  discoveredSources: PluginSourceSummaryView[];
  writableTargets: WritablePluginTarget[];
}

export interface McpConnectionTestResult {
  name: string;
  status: "connected" | "failed";
  toolCount: number;
  stage: "validation" | "connection" | "discovery";
  message: string;
  error?: string;
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}
