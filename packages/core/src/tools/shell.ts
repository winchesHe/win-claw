import { exec } from "node:child_process";
import pino from "pino";
import type { Tool, ToolResult } from "../types.js";

const logger = pino({ name: "@winches/core/shell" });
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_LENGTH = 8_000;

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n...(truncated, total ${str.length} chars)`;
}

function runCommand(command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = exec(command, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code === undefined ? 1 : (error as { code: number }).code : 0,
      });
    });
    // ensure we don't hang if child is somehow orphaned
    child.unref?.();
  });
}

export const shellTools: Tool[] = [
  {
    name: "shell.exec",
    description:
      "Execute a shell command and return stdout/stderr. Use for tasks like searching files (find, grep), checking system info, or running short-lived commands. Do NOT use for long-running or interactive processes.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 15000)" },
      },
      required: ["command"],
    },
    dangerLevel: "safe",
    async execute(params: unknown): Promise<ToolResult> {
      const { command, timeout } = params as { command: string; timeout?: number };
      const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;

      logger.info({ command, timeoutMs }, "[shell] executing command");
      try {
        const { stdout, stderr, exitCode } = await runCommand(command, timeoutMs);
        logger.info({ exitCode, stdoutLen: stdout.length, stderrLen: stderr.length }, "[shell] command completed");
        return {
          success: true,
          data: {
            exitCode,
            stdout: truncate(stdout, MAX_OUTPUT_LENGTH),
            stderr: truncate(stderr, MAX_OUTPUT_LENGTH),
          },
        };
      } catch (err) {
        logger.error({ err }, "[shell] command threw error");
        return { success: false, error: (err as Error).message };
      }
    },
  },
];
