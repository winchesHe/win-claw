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

  constructor(
    message: string,
    scriptName: string,
    options?: { cause?: unknown },
  ) {
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
    super(
      `Approval with id "${approvalId}" not found`,
      "APPROVAL_NOT_FOUND",
      options,
    );
    this.name = "ApprovalNotFoundError";
    this.approvalId = approvalId;
  }
}
