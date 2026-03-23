/** 工具权限级别 */
export type DangerLevel = "safe" | "confirm" | "dangerous";

/** JSON Schema 对象（与 @winches/ai ToolDefinition.parameters 兼容） */
export type JSONSchema = Record<string, unknown>;

/** 工具接口 */
export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  dangerLevel: DangerLevel;
  execute(params: unknown): Promise<ToolResult>;
}

/** 工具执行结果（判别联合类型） */
export type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

/** 文件列表条目 */
export interface FileEntry {
  name: string;
  type: "file" | "directory";
  size: number; // 字节数
}
