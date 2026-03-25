CREATE TABLE IF NOT EXISTS working_memories (
  id         TEXT    PRIMARY KEY,
  session_id TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,  -- Unix timestamp (ms)
  ttl        INTEGER NOT NULL,  -- milliseconds
  importance REAL    NOT NULL DEFAULT 0.5
);

CREATE INDEX IF NOT EXISTS idx_working_memories_session
  ON working_memories (session_id, created_at);
