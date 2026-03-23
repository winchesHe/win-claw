-- Migration: 002_add_memory_vectors.sql
-- Add vector column to memories table for semantic search
ALTER TABLE memories ADD COLUMN vector TEXT; -- JSON-serialized number[]
