// ===== 消息类型 =====

/** 消息角色 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** 内容部分 — 文本类型 */
export interface TextContentPart {
  type: "text";
  text: string;
}

/** 内容部分联合类型（未来可扩展图片等多模态类型） */
export type ContentPart = TextContentPart;

/** 对话消息 */
export interface Message {
  role: MessageRole;
  content: string | ContentPart[];
  /** tool 角色消息需要关联的 tool_call_id */
  toolCallId?: string;
  /** assistant 角色消息携带的工具调用列表 */
  toolCalls?: ToolCall[];
}

// ===== 工具类型 =====

/** 工具定义（JSON Schema 描述参数） */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema 对象
}

/** 工具调用（LLM 返回的调用请求） */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON 字符串
}

// ===== 请求/响应类型 =====

/** 聊天请求选项 */
export interface ChatOptions {
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/** 非流式聊天响应 */
export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

/** 流式聊天增量块 */
export interface ChatChunk {
  content?: string;
  toolCalls?: (Partial<ToolCall> & { index?: number })[];
  /** 最后一个 chunk 标记完成 */
  done?: boolean;
}

/** Token 使用量统计 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ===== 配置类型 =====

/** LLM 配置 */
export interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

/** Provider 配置（传给工厂函数） */
export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

// ===== Provider 接口 =====

/** 统一 LLM Provider 接口 */
export interface LLMProvider {
  readonly name: string;

  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
}
