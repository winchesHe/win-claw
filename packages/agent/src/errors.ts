import type { AgentStatus } from "./types.js";

export class AgentError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AgentError";
  }
}

export class AgentConfigError extends AgentError {
  public readonly missingField: string;
  constructor(missingField: string) {
    super(`AgentConfig missing required field: "${missingField}"`);
    this.name = "AgentConfigError";
    this.missingField = missingField;
  }
}

export class AgentBusyError extends AgentError {
  public readonly currentStatus: AgentStatus;
  constructor(currentStatus: AgentStatus) {
    super(`Agent is busy (status: "${currentStatus}"). Wait for current chat to complete.`);
    this.name = "AgentBusyError";
    this.currentStatus = currentStatus;
  }
}
