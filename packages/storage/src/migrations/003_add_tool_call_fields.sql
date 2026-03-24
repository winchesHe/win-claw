-- Migration: 003_add_tool_call_fields.sql
-- Add tool_call_id and tool_calls columns to messages table
-- for proper round-trip of tool call metadata

ALTER TABLE messages ADD COLUMN tool_call_id TEXT;
ALTER TABLE messages ADD COLUMN tool_calls TEXT;
