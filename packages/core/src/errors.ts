/** 基础 Core 包错误 */
export class CoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CoreError";
  }
}

/** 工具名称重复注册错误 */
export class DuplicateToolError extends CoreError {
  public readonly toolName: string;
  constructor(toolName: string) {
    super(`Tool "${toolName}" is already registered`);
    this.name = "DuplicateToolError";
    this.toolName = toolName;
  }
}

/** 工具参数校验错误（工具内部使用，不对外抛出） */
export class ToolParamError extends CoreError {
  public readonly toolName: string;
  constructor(toolName: string, message: string) {
    super(`[${toolName}] Invalid params: ${message}`);
    this.name = "ToolParamError";
    this.toolName = toolName;
  }
}
