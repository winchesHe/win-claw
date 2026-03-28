// 核心类
export { Agent } from "./agent.js";

// Prompt 构建
export { buildSystemPrompt } from "./prompt.js";

// 类型
export type {
  AgentConfig,
  AgentEvent,
  AgentStatus,
  ApprovalRequest,
  SystemPromptParams,
} from "./types.js";

// Slash Commands
export { handleSlashCommand, getSlashCommandCompletions } from "./slash-commands.js";
export type { SlashCommandResult, SlashCommandCompletion } from "./slash-commands.js";

// 错误
export { AgentError, AgentConfigError, AgentBusyError } from "./errors.js";
