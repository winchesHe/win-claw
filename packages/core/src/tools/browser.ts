import type { Tool } from "../types.js";

export const browserTools: Tool[] = [
  {
    name: "browser.open",
    description: "Open a URL in the browser",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    dangerLevel: "safe",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "browser.screenshot",
    description: "Take a screenshot of the current browser page",
    parameters: { type: "object", properties: {} },
    dangerLevel: "safe",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "browser.click",
    description: "Click an element by CSS selector",
    parameters: {
      type: "object",
      properties: { selector: { type: "string" } },
      required: ["selector"],
    },
    dangerLevel: "confirm",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "browser.type",
    description: "Type text into an element by CSS selector",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" },
      },
      required: ["selector", "text"],
    },
    dangerLevel: "confirm",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "browser.evaluate",
    description: "Evaluate a JavaScript script in the browser context",
    parameters: {
      type: "object",
      properties: { script: { type: "string" } },
      required: ["script"],
    },
    dangerLevel: "confirm",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
  {
    name: "browser.navigate",
    description: "Navigate the browser toward a goal",
    parameters: {
      type: "object",
      properties: { goal: { type: "string" } },
      required: ["goal"],
    },
    dangerLevel: "confirm",
    async execute(_params: unknown): Promise<{ success: false; error: string }> {
      return { success: false, error: "Not implemented (Phase 4)" };
    },
  },
];
