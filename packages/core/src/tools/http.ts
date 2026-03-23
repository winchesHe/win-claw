import type { Tool } from "../types.js";

export const httpTools: Tool[] = [
  {
    name: "http.get",
    description: "Perform an HTTP GET request",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        headers: { type: "object" },
      },
      required: ["url"],
    },
    dangerLevel: "safe",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "http.post",
    description: "Perform an HTTP POST request",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        body: {},
        headers: { type: "object" },
      },
      required: ["url"],
    },
    dangerLevel: "confirm",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
];
