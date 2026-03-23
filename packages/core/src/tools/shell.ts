import type { Tool } from "../types.js";

export const shellTools: Tool[] = [
  {
    name: "shell.exec",
    description: "Execute a shell command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout: { type: "number" },
      },
      required: ["command"],
    },
    dangerLevel: "dangerous",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
];
