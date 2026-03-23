-- Migration: 001_init.sql
-- Initial schema for @winches/storage

-- Migration version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT    PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- Conversation history
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT    PRIMARY KEY,
  session_id TEXT    NOT NULL,
  role       TEXT    NOT NULL, -- system/user/assistant/tool
  content    TEXT    NOT NULL, -- JSON-serialized content
  created_at INTEGER NOT NULL  -- Unix timestamp (ms)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);

-- Long-term memories
CREATE TABLE IF NOT EXISTS memories (
  id         TEXT    PRIMARY KEY,
  content    TEXT    NOT NULL,
  tags       TEXT    NOT NULL DEFAULT '[]', -- JSON-serialized string[]
  created_at INTEGER NOT NULL
);

-- Scheduled tasks
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id         TEXT    PRIMARY KEY,
  trigger_at INTEGER NOT NULL, -- Unix timestamp (ms)
  payload    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status_trigger ON scheduled_tasks (status, trigger_at);

-- Tool execution audit logs
CREATE TABLE IF NOT EXISTS tool_execution_logs (
  id          TEXT    PRIMARY KEY,
  tool_name   TEXT    NOT NULL,
  input       TEXT    NOT NULL, -- JSON
  output      TEXT    NOT NULL, -- JSON
  duration_ms INTEGER NOT NULL,
  session_id  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_logs_session   ON tool_execution_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_tool_name ON tool_execution_logs (tool_name);

-- Approval queue
CREATE TABLE IF NOT EXISTS approval_requests (
  id           TEXT    PRIMARY KEY,
  tool_name    TEXT    NOT NULL,
  params       TEXT    NOT NULL, -- JSON
  danger_level TEXT    NOT NULL,
  session_id   TEXT,
  status       TEXT    NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests (status);
