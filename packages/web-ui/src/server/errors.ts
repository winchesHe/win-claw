export class WebUIError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WebUIError";
  }
}

export class ConfigValidationError extends WebUIError {
  public readonly field: string;
  public readonly reason: string;

  constructor(field: string, reason: string) {
    super(`Config validation failed for "${field}": ${reason}`);
    this.name = "ConfigValidationError";
    this.field = field;
    this.reason = reason;
  }
}

export class UnknownEnvKeyError extends WebUIError {
  public readonly invalidKeys: string[];

  constructor(invalidKeys: string[]) {
    super(`Unknown environment variable keys: ${invalidKeys.join(", ")}`);
    this.name = "UnknownEnvKeyError";
    this.invalidKeys = invalidKeys;
  }
}
