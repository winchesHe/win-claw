import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pino from "pino";

export function createFileLogger(name: string, rootDir: string, level: pino.Level = "info"): pino.Logger {
  const logPath = resolve(rootDir, "data/agent.log");
  mkdirSync(dirname(logPath), { recursive: true });

  const destination = pino.destination({ dest: logPath, mkdir: true, sync: false });
  return pino({ name, level }, destination);
}
