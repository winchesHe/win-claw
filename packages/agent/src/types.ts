import type { LLMProvider } from "@winches/ai";
import type { IToolRegistry, ISkillRegistry, IMcpClientManager, ToolResult } from "@winches/core";
import type { StorageService } from "@winches/storage";
import type { DangerLevel } from "@winches/core";

/** Agent 构造配置 */
export interface AgentConfig {
  provider: LLMProvider;
  storage: StorageService;
  registry: IToolRegistry;
  sessionId: string;
  systemPrompt?: string;
  maxIterations?: number;
  skillRegistry?: ISkillRegistry;
  mcpClientManager?: IMcpClientManager;
  logger?: import("pino").Logger;
}

/** Agent 内部使用的已解析配置（必填字段已填充默认值） */
export type ResolvedAgentConfig = Required<
  Pick<
    AgentConfig,
    "provider" | "storage" | "registry" | "sessionId" | "systemPrompt" | "maxIterations"
  >
> &
  Pick<AgentConfig, "skillRegistry" | "mcpClientManager">;

/** Agent 运行状态 */
export type AgentStatus = "idle" | "running" | "waiting_approval";

/** 需要用户审批的工具调用请求 */
export interface ApprovalRequest {
  toolName: string;
  params: unknown;
  dangerLevel: DangerLevel;
}

/** Agent 流式事件（判别联合类型） */
export type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; tool: string; params: unknown }
  | { type: "tool_result"; result: ToolResult }
  | { type: "approval_needed"; request: ApprovalRequest }
  | { type: "done" };

/** buildSystemPrompt 的参数 */
export interface SystemPromptParams {
  /** 工具注册表，用于生成工具列表 */
  registry: IToolRegistry;
  /** Skill 注册表（可选），用于生成 Skills 区块 */
  skillRegistry?: ISkillRegistry;
  /** 工作目录（默认 process.cwd()） */
  cwd?: string;
  /** 用户主目录（默认 os.homedir()） */
  homeDir?: string;
  /** 工作区引导说明（可选） */
  workspaceGuidance?: string;
  /** 工作区备注（可选） */
  workspaceNotes?: string;
  /** AGENTS.md 内容（可选） */
  agentsMd?: string;
  /** 读取工具名称，用于 Skills 区块中的指令（默认 "file-read"） */
  readToolName?: string;
  /** Skills 原始 prompt（由 skillRegistry 渲染后传入） */
  skillsPrompt?: string;
}
