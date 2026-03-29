import { readFileSync, existsSync } from "node:fs";
import type { LogEntry } from "../types.js";

const LEVEL_MAP: Record<number, string> = {
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
};

const LEVEL_NAME_TO_NUMBER: Record<string, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

export class LogService {
  private readonly logPath: string;

  constructor(logPath: string = "data/agent.log") {
    this.logPath = logPath;
  }

  getLogs(options?: { level?: string; limit?: number }): LogEntry[] {
    if (!existsSync(this.logPath)) {
      throw new Error(`Log file not found: ${this.logPath}`);
    }

    const content = readFileSync(this.logPath, "utf-8");
    const lines = content.split("\n");
    const entries: LogEntry[] = [];

    const levelThreshold = options?.level != null ? LEVEL_NAME_TO_NUMBER[options.level] : undefined;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        // Skip lines that fail JSON parsing
        continue;
      }

      const level = typeof parsed.level === "number" ? parsed.level : 30;
      const time = typeof parsed.time === "number" ? parsed.time : 0;
      const msg = typeof parsed.msg === "string" ? parsed.msg : "";

      if (levelThreshold != null && level < levelThreshold) {
        continue;
      }

      const { level: _level, time: _time, msg: _msg, ...extra } = parsed;

      const entry: LogEntry = {
        timestamp: new Date(time).toISOString(),
        level,
        levelLabel: LEVEL_MAP[level] ?? "unknown",
        msg,
        ...extra,
      };

      entries.push(entry);

      if (options?.limit != null && entries.length >= options.limit) {
        break;
      }
    }

    return entries.reverse();
  }
}
