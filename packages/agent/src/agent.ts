import pino from "pino";
import type { Message } from "@winches/ai";
import type { AgentConfig, AgentEvent, AgentStatus, ApprovalRequest } from "./types.js";
import { AgentConfigError, AgentBusyError } from "./errors.js";
import { conversationLoop } from "./loop.js";

import os from "node:os";

const REQUIRED_FIELDS: (keyof AgentConfig)[] = ["provider", "storage", "registry", "sessionId"];
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_SYSTEM_PROMPT = `You are a helpful personal assistant with access to tools for file operations and shell commands. Use tools when needed to complete tasks. Always explain what you're doing before using a tool.

The user's home directory is: ${os.homedir()}

Important rules:
- Available tools: file-read, file-write, file-delete, file-list, file-move, shell-exec.
- When calling file-list, you MUST provide the "dirPath" parameter.
- When calling file-read, you MUST provide the "filePath" parameter.
- When calling shell-exec, you MUST provide the "command" parameter.
- For searching files or directories by name, prefer shell-exec with "find" command. Example: {"command": "find ${os.homedir()} -maxdepth 4 -type d -name 'project-name' 2>/dev/null"}
- Do NOT use shell-exec for long-running or interactive processes.
- If a tool call fails, do NOT retry with the same parameters. Try a different approach.`;

export class Agent {
  private readonly config: Required<AgentConfig>;
  private status: AgentStatus = "idle";
  private readonly logger = pino({ name: "@winches/agent" });

  /**
   * 审批回调，由宿主程序注册。
   * 未注册时，所有需要审批的工具调用自动拒绝。
   */
  onApprovalNeeded: ((request: ApprovalRequest) => Promise<boolean>) | undefined;

  constructor(config: AgentConfig) {
    // 校验必填字段
    for (const field of REQUIRED_FIELDS) {
      if (config[field] == null) {
        throw new AgentConfigError(field);
      }
    }

    this.config = {
      ...config,
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    };
  }

  /**
   * 核心对话方法，流式返回 AgentEvent。
   * 保证最后一个事件为 { type: "done" }。
   *
   * @throws {AgentBusyError} 当 Agent 正在处理另一个请求时
   */
  async *chat(messages: Message[]): AsyncIterable<AgentEvent> {
    if (this.status !== "idle") {
      throw new AgentBusyError(this.status);
    }

    this.status = "running";
    this.logger.debug({ sessionId: this.config.sessionId }, "chat started");

    try {
      yield* conversationLoop({
        messages,
        config: this.config,
        getStatus: () => this.status,
        setStatus: (s) => {
          this.status = s;
        },
        onApprovalNeeded: this.onApprovalNeeded,
        logger: this.logger,
      });
    } finally {
      this.status = "idle";
    }
  }

  /** 查询当前运行状态 */
  getStatus(): AgentStatus {
    return this.status;
  }
}
