/** 基础 Storage 包错误 */
export class StorageError extends Error {
  public readonly code?: string;

  constructor(message: string, code?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}

/** 配置加载错误 */
export class ConfigError extends StorageError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
    this.field = field;
  }
}

/** 数据库迁移错误 */
export class MigrationError extends StorageError {
  public readonly scriptName: string;

  constructor(message: string, scriptName: string, options?: { cause?: unknown }) {
    super(message, "MIGRATION_ERROR", options);
    this.name = "MigrationError";
    this.scriptName = scriptName;
  }
}

/** Embedding 生成错误 */
export class EmbeddingError extends StorageError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "EMBEDDING_ERROR", options);
    this.name = "EmbeddingError";
  }
}

/** 重复任务 ID 错误 */
export class DuplicateTaskError extends StorageError {
  public readonly taskId: string;

  constructor(taskId: string, options?: { cause?: unknown }) {
    super(`Task with id "${taskId}" already exists`, "DUPLICATE_TASK", options);
    this.name = "DuplicateTaskError";
    this.taskId = taskId;
  }
}

/** 审批记录不存在错误 */
export class ApprovalNotFoundError extends StorageError {
  public readonly approvalId: string;

  constructor(approvalId: string, options?: { cause?: unknown }) {
    super(`Approval with id "${approvalId}" not found`, "APPROVAL_NOT_FOUND", options);
    this.name = "ApprovalNotFoundError";
    this.approvalId = approvalId;
  }
}

/** importance 值超出 [0,1] 范围错误 */
export class InvalidImportanceError extends StorageError {
  public readonly value: number;

  constructor(value: number) {
    super(`Importance value ${value} is out of range [0, 1]`, "INVALID_IMPORTANCE");
    this.name = "InvalidImportanceError";
    this.value = value;
  }
}

/** decayRate 为负数错误 */
export class InvalidDecayRateError extends StorageError {
  public readonly value: number;

  constructor(value: number) {
    super(`Decay rate ${value} must be >= 0`, "INVALID_DECAY_RATE");
    this.name = "InvalidDecayRateError";
    this.value = value;
  }
}

/** forget() 参数缺少必要字段错误 */
export class InvalidForgetOptionsError extends StorageError {
  public readonly missingField: string;

  constructor(missingField: string) {
    super(`forget() options missing required field: "${missingField}"`, "INVALID_FORGET_OPTIONS");
    this.name = "InvalidForgetOptionsError";
    this.missingField = missingField;
  }
}
