import type { Tool } from "../types.js";

export const systemTools: Tool[] = [
  {
    name: "system.info",
    description: "Get system information",
    parameters: { type: "object", properties: {} },
    dangerLevel: "safe",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "system.processes",
    description: "List running system processes",
    parameters: { type: "object", properties: {} },
    dangerLevel: "safe",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
];
