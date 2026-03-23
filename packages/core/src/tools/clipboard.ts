import type { Tool } from "../types.js";

export const clipboardTools: Tool[] = [
  {
    name: "clipboard.read",
    description: "Read text from the clipboard",
    parameters: { type: "object", properties: {} },
    dangerLevel: "safe",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "clipboard.write",
    description: "Write text to the clipboard",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    dangerLevel: "confirm",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
];
