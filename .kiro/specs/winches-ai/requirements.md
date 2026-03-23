# 需求文档 — @winches/ai 统一 LLM 抽象层

## 简介

`@winches/ai` 是 winches-agent monorepo 中最底层的包，提供统一的多 Provider LLM 调用接口。该包抹平不同 LLM Provider（OpenAI、Anthropic、Google、OpenAI 兼容接口）之间的 API 差异，对外暴露一致的聊天和流式聊天接口，支持 Tool Calling、运行时 Provider 切换和自动重试机制。该包不包含 Embedding 接口（由 `@winches/storage` 负责）。

## 术语表

- **AI_Package**: `@winches/ai` 包，统一 LLM 抽象层的 TypeScript 实现
- **LLM_Provider**: 实现了统一聊天接口的 LLM 服务适配器（如 OpenAI、Anthropic、Google、OpenAI 兼容）
- **Message**: 对话消息对象，包含角色（role）和内容（content）
- **ChatOptions**: 聊天请求的可选参数，包括工具定义、温度、最大 token 数、模型名称
- **ChatResponse**: 非流式聊天的完整响应对象
- **ChatChunk**: 流式聊天中每次迭代返回的增量数据块
- **ContentPart**: 消息内容的组成部分，支持文本和其他多模态内容类型
- **ToolDefinition**: 工具的结构化定义，包含名称、描述和参数 JSON Schema
- **ToolCall**: LLM 返回的工具调用请求，包含工具名称和调用参数
- **Provider_Registry**: 管理和创建 LLM_Provider 实例的注册中心
- **Config_Loader**: 从 YAML 配置文件和环境变量加载 LLM 配置的模块
- **Retry_Handler**: 处理 LLM 调用失败时自动重试逻辑的模块

## 需求

### 需求 1：核心消息类型定义

**用户故事：** 作为上层包的开发者，我希望有统一的消息类型定义，以便在不同 Provider 之间传递一致的对话数据。

#### 验收标准

1. THE AI_Package SHALL 导出 Message 接口，包含 role 字段（取值为 "system"、"user"、"assistant"、"tool" 之一）和 content 字段（类型为 string 或 ContentPart 数组）
2. THE AI_Package SHALL 导出 ContentPart 类型，支持文本类型的内容部分
3. THE AI_Package SHALL 导出 ChatOptions 接口，包含可选的 tools（ToolDefinition 数组）、temperature（number）、maxTokens（number）和 model（string）字段
4. THE AI_Package SHALL 导出 ToolDefinition 接口，包含 name（string）、description（string）和 parameters（JSON Schema 对象）字段
5. THE AI_Package SHALL 导出 ChatResponse 接口，包含响应消息内容和可选的 ToolCall 数组
6. THE AI_Package SHALL 导出 ChatChunk 接口，包含增量文本内容和可选的增量 ToolCall 数据
7. THE AI_Package SHALL 导出 ToolCall 接口，包含 id（string）、name（string）和 arguments（string）字段

### 需求 2：LLM Provider 统一接口

**用户故事：** 作为上层包的开发者，我希望通过统一接口调用不同的 LLM 服务，以便在不修改业务代码的情况下切换 Provider。

#### 验收标准

1. THE AI_Package SHALL 导出 LLM_Provider 接口，包含 chat 方法和 chatStream 方法
2. WHEN 调用 chat 方法时，THE LLM_Provider SHALL 接受 Message 数组和可选的 ChatOptions 参数，返回 Promise<ChatResponse>
3. WHEN 调用 chatStream 方法时，THE LLM_Provider SHALL 接受 Message 数组和可选的 ChatOptions 参数，返回 AsyncIterable<ChatChunk>
4. THE LLM_Provider SHALL 在 chat 和 chatStream 方法中支持通过 ChatOptions.tools 传入工具定义
5. WHEN LLM 返回工具调用请求时，THE LLM_Provider SHALL 将 Provider 特定的工具调用格式转换为统一的 ToolCall 格式

### 需求 3：OpenAI Provider 实现

**用户故事：** 作为用户，我希望能够使用 OpenAI 的 GPT 系列模型，以便利用 OpenAI 的 LLM 能力。

#### 验收标准

1. THE AI_Package SHALL 提供 OpenAI LLM_Provider 实现，支持 GPT-4o 等 OpenAI 模型
2. WHEN 调用 OpenAI LLM_Provider 的 chat 方法时，THE OpenAI LLM_Provider SHALL 将统一 Message 格式转换为 OpenAI API 格式并发送请求
3. WHEN 调用 OpenAI LLM_Provider 的 chatStream 方法时，THE OpenAI LLM_Provider SHALL 使用 OpenAI 的流式 API 并将响应转换为 AsyncIterable<ChatChunk>
4. WHEN OpenAI API 返回 tool_calls 时，THE OpenAI LLM_Provider SHALL 将 OpenAI 格式的工具调用转换为统一的 ToolCall 格式
5. THE OpenAI LLM_Provider SHALL 支持通过配置指定 API Key 和可选的 Base URL

### 需求 4：Anthropic Provider 实现

**用户故事：** 作为用户，我希望能够使用 Anthropic 的 Claude 系列模型，以便利用 Claude 的 LLM 能力。

#### 验收标准

1. THE AI_Package SHALL 提供 Anthropic LLM_Provider 实现，支持 Claude 系列模型
2. WHEN 调用 Anthropic LLM_Provider 的 chat 方法时，THE Anthropic LLM_Provider SHALL 将统一 Message 格式转换为 Anthropic API 格式并发送请求
3. WHEN 调用 Anthropic LLM_Provider 的 chatStream 方法时，THE Anthropic LLM_Provider SHALL 使用 Anthropic 的流式 API 并将响应转换为 AsyncIterable<ChatChunk>
4. WHEN Anthropic API 返回 tool_use 内容块时，THE Anthropic LLM_Provider SHALL 将 Anthropic 格式的工具调用转换为统一的 ToolCall 格式
5. THE Anthropic LLM_Provider SHALL 支持通过配置指定 API Key

### 需求 5：Google Gemini Provider 实现

**用户故事：** 作为用户，我希望能够使用 Google 的 Gemini 系列模型，以便利用 Gemini 的 LLM 能力。

#### 验收标准

1. THE AI_Package SHALL 提供 Google LLM_Provider 实现，支持 Gemini 系列模型
2. WHEN 调用 Google LLM_Provider 的 chat 方法时，THE Google LLM_Provider SHALL 将统一 Message 格式转换为 Google Gemini API 格式并发送请求
3. WHEN 调用 Google LLM_Provider 的 chatStream 方法时，THE Google LLM_Provider SHALL 使用 Gemini 的流式 API 并将响应转换为 AsyncIterable<ChatChunk>
4. WHEN Gemini API 返回 functionCall 部分时，THE Google LLM_Provider SHALL 将 Gemini 格式的工具调用转换为统一的 ToolCall 格式
5. THE Google LLM_Provider SHALL 支持通过配置指定 API Key

### 需求 6：OpenAI 兼容 Provider 实现

**用户故事：** 作为用户，我希望能够使用 OpenAI 兼容接口的服务（如 DeepSeek、Ollama），以便灵活选择 LLM 服务。

#### 验收标准

1. THE AI_Package SHALL 提供 OpenAI 兼容 LLM_Provider 实现，复用 OpenAI Provider 的核心逻辑
2. THE OpenAI 兼容 LLM_Provider SHALL 支持通过配置指定自定义 Base URL
3. WHEN 配置中指定了自定义 Base URL 时，THE OpenAI 兼容 LLM_Provider SHALL 将所有 API 请求发送到该 Base URL
4. THE OpenAI 兼容 LLM_Provider SHALL 支持 DeepSeek 和 Ollama 等兼容 OpenAI API 格式的服务

### 需求 7：Provider 注册与工厂

**用户故事：** 作为上层包的开发者，我希望通过统一的工厂方法创建 Provider 实例，以便根据配置动态选择 Provider。

#### 验收标准

1. THE Provider_Registry SHALL 支持按名称注册 LLM_Provider 工厂函数
2. WHEN 传入 Provider 名称和配置时，THE Provider_Registry SHALL 创建并返回对应的 LLM_Provider 实例
3. THE Provider_Registry SHALL 预注册 "openai"、"anthropic"、"google" 和 "openai-compatible" 四种 Provider
4. IF 请求的 Provider 名称未注册，THEN THE Provider_Registry SHALL 抛出包含未注册 Provider 名称的描述性错误

### 需求 8：配置加载

**用户故事：** 作为用户，我希望通过 YAML 配置文件和环境变量配置 LLM Provider，以便灵活管理不同环境的配置。

#### 验收标准

1. THE Config_Loader SHALL 从 YAML 配置文件中读取 llm 配置段，包含 provider、model、apiKey 和 baseUrl 字段
2. WHEN 配置值包含 `${ENV_VAR}` 格式的环境变量引用时，THE Config_Loader SHALL 将其替换为对应环境变量的实际值
3. WHEN 环境变量 AGENT_LLM_PROVIDER、AGENT_LLM_MODEL、AGENT_API_KEY 存在时，THE Config_Loader SHALL 使用环境变量值覆盖配置文件中的对应值
4. IF 必需的配置项（provider、model、apiKey）缺失且无对应环境变量，THEN THE Config_Loader SHALL 抛出包含缺失配置项名称的描述性错误

### 需求 9：自动重试机制

**用户故事：** 作为上层包的开发者，我希望 LLM 调用失败时能自动重试，以便提高系统的可靠性。

#### 验收标准

1. WHEN LLM 调用失败时，THE Retry_Handler SHALL 自动重试，最多重试 3 次
2. THE Retry_Handler SHALL 在每次重试之间使用指数退避策略增加等待时间
3. IF 所有重试均失败，THEN THE Retry_Handler SHALL 抛出包含最后一次失败原因的错误
4. WHEN 流式调用（chatStream）失败时，THE Retry_Handler SHALL 对流式调用应用相同的重试策略
5. THE Retry_Handler SHALL 仅对可重试的错误（网络错误、速率限制、服务端 5xx 错误）进行重试
6. THE Retry_Handler SHALL 对不可重试的错误（认证失败、请求格式错误等 4xx 错误，速率限制除外）立即抛出，不进行重试

### 需求 10：运行时 Provider 切换

**用户故事：** 作为上层包的开发者，我希望在运行时切换 LLM Provider，以便在不重启应用的情况下更换模型服务。

#### 验收标准

1. THE AI_Package SHALL 提供运行时切换当前 LLM_Provider 的能力
2. WHEN 切换 Provider 时，THE AI_Package SHALL 使用 Provider_Registry 创建新的 LLM_Provider 实例
3. WHEN Provider 切换完成后，THE AI_Package SHALL 使用新的 LLM_Provider 处理后续的所有聊天请求

### 需求 11：Tool Calling 格式统一

**用户故事：** 作为上层包的开发者，我希望不同 Provider 的 Tool Calling 格式被统一抹平，以便上层代码无需关心 Provider 差异。

#### 验收标准

1. THE AI_Package SHALL 定义统一的 ToolDefinition 格式，使用 JSON Schema 描述工具参数
2. WHEN 向 LLM 发送工具定义时，THE LLM_Provider SHALL 将统一的 ToolDefinition 转换为 Provider 特定的工具定义格式
3. WHEN LLM 返回工具调用时，THE LLM_Provider SHALL 将 Provider 特定的工具调用响应转换为统一的 ToolCall 格式
4. FOR ALL 支持的 Provider，将相同的 ToolDefinition 传入并收到工具调用响应后，THE LLM_Provider SHALL 返回结构一致的 ToolCall 对象
