import fs from "node:fs/promises";
import path from "node:path";
import type { Tool, ToolResult, FileEntry, DangerLevel } from "../types.js";

const fileReadTool: Tool = {
  name: "file.read",
  description: "读取指定路径的文件内容",
  dangerLevel: "safe" as DangerLevel,
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "文件路径" },
      encoding: { type: "string", description: "文件编码，默认 utf-8" },
    },
    required: ["filePath"],
  },
  async execute(params: unknown): Promise<ToolResult> {
    try {
      const { filePath, encoding = "utf-8" } = params as {
        filePath: string;
        encoding?: string;
      };
      const data = await fs.readFile(filePath, { encoding: encoding as BufferEncoding });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
};

const fileWriteTool: Tool = {
  name: "file.write",
  description: "将内容写入指定路径的文件，目录不存在时自动创建",
  dangerLevel: "confirm" as DangerLevel,
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "目标文件路径" },
      content: { type: "string", description: "写入内容" },
    },
    required: ["filePath", "content"],
  },
  async execute(params: unknown): Promise<ToolResult> {
    try {
      const { filePath, content } = params as {
        filePath: string;
        content: string;
      };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
};

const fileDeleteTool: Tool = {
  name: "file.delete",
  description: "删除指定路径的文件",
  dangerLevel: "dangerous" as DangerLevel,
  parameters: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "要删除的文件路径" },
    },
    required: ["filePath"],
  },
  async execute(params: unknown): Promise<ToolResult> {
    try {
      const { filePath } = params as { filePath: string };
      await fs.unlink(filePath);
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
};

const MAX_RECURSIVE_DEPTH = 3;
const MAX_ENTRIES = 500;

async function listEntries(dirPath: string, recursive: boolean, depth = 0): Promise<FileEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (result.length >= MAX_ENTRIES) break;
    const fullPath = path.join(dirPath, entry.name);
    let size = 0;
    try {
      const stat = await fs.stat(fullPath);
      size = stat.size;
    } catch {
      // skip entries we can't stat (permission denied, etc.)
      continue;
    }
    const type: "file" | "directory" = entry.isDirectory() ? "directory" : "file";
    result.push({ name: entry.name, type, size });
    if (recursive && entry.isDirectory() && depth < MAX_RECURSIVE_DEPTH) {
      try {
        const children = await listEntries(fullPath, true, depth + 1);
        result.push(...children);
      } catch {
        // skip directories we can't read
      }
    }
  }
  return result;
}

const fileListTool: Tool = {
  name: "file.list",
  description: "列出指定目录下的文件和子目录",
  dangerLevel: "safe" as DangerLevel,
  parameters: {
    type: "object",
    properties: {
      dirPath: { type: "string", description: "目录路径" },
      recursive: { type: "boolean", description: "是否递归列出子目录，默认 false" },
    },
    required: ["dirPath"],
  },
  async execute(params: unknown): Promise<ToolResult> {
    try {
      const { dirPath, recursive = false } = params as {
        dirPath: string;
        recursive?: boolean;
      };
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return { success: false, error: `路径不是目录: ${dirPath}` };
      }
      const data = await listEntries(dirPath, recursive);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
};

const fileMoveTool: Tool = {
  name: "file.move",
  description: "将文件从源路径移动到目标路径，目标目录不存在时自动创建",
  dangerLevel: "confirm" as DangerLevel,
  parameters: {
    type: "object",
    properties: {
      sourcePath: { type: "string", description: "源文件路径" },
      destPath: { type: "string", description: "目标文件路径" },
    },
    required: ["sourcePath", "destPath"],
  },
  async execute(params: unknown): Promise<ToolResult> {
    try {
      const { sourcePath, destPath } = params as {
        sourcePath: string;
        destPath: string;
      };
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.rename(sourcePath, destPath);
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
};

export const fileTools: Tool[] = [
  fileReadTool,
  fileWriteTool,
  fileDeleteTool,
  fileListTool,
  fileMoveTool,
];
