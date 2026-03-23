/** 基础 AI 包错误 */
export class AIError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIError";
  }
}

/** Provider 相关错误 */
export class ProviderError extends AIError {
  public readonly provider: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    provider: string,
    statusCode?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProviderError";
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

/** 配置相关错误 */
export class ConfigError extends AIError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ConfigError";
    this.field = field;
  }
}

/** 重试耗尽错误 */
export class RetryExhaustedError extends AIError {
  public readonly attempts: number;

  constructor(
    message: string,
    attempts: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "RetryExhaustedError";
    this.attempts = attempts;
  }
}
