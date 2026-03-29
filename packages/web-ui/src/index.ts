// Core — server entry
export { createApp, startServer } from "./server/index.js";
export type { CreateAppOptions } from "./server/index.js";

// Types
export type { AppConfig, EnvVar, LogEntry, SystemStatus } from "./server/types.js";

// Errors
export { WebUIError, ConfigValidationError, UnknownEnvKeyError } from "./server/errors.js";
