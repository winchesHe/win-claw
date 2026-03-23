import type { Tool } from "../types.js";

export const schedulerTools: Tool[] = [
  {
    name: "scheduler.set",
    description: "Schedule a recurring action using a cron expression",
    parameters: {
      type: "object",
      properties: {
        cronExpression: { type: "string" },
        action: { type: "string" },
      },
      required: ["cronExpression", "action"],
    },
    dangerLevel: "confirm",
    async execute(): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "scheduler.list",
    description: "List all scheduled tasks",
    parameters: { type: "object", properties: {} },
    dangerLevel: "safe",
    async execute(): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "scheduler.cancel",
    description: "Cancel a scheduled task by ID",
    parameters: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
    dangerLevel: "safe",
    async execute(): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
];
