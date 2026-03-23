# 实现计划：@winches/ai 统一 LLM 抽象层

## 概述

基于需求文档和技术设计，将 `@winches/ai` 包的实现拆分为增量式编码任务。每个任务构建在前一个任务之上，从类型定义开始，逐步实现基础设施层、Provider 层和门面类，最终通过 `index.ts` 统一导出。

## 任务

- [x] 1. 定义核心类型与错误类型
  - [x] 1.1 创建 `packages/ai/src/types.ts`，定义所有核心类型
    - 定义 `MessageRole`、`TextContentPart`、`ContentPart`、`Message` 类型
    - 定义 `ToolDefinition`、`ToolCall` 类型
    - 定义 `ChatOptions`、`ChatResponse`、`ChatChunk`、`TokenUsage` 类型
    - 定义 `LLMConfig`、`ProviderConfig` 类型
    - 定义 `LLMProvider` 接口（包含 `name`、`chat`、`chatStream`）
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1_
  - [x] 1.2 创建 `packages/ai/src/errors.ts`，定义自定义错误类型
    - 实现 `AIError`、`ProviderError`、`ConfigError`、`RetryExhaustedError`
    - _需求: 7.4, 8.4, 9.3_

- [x] 2. 实现 ProviderRegistry
  - [x] 2.1 创建 `packages/ai/src/registry.ts`，实现 Provider 工厂注册中心
    - 实现 `register`、`create`、`has` 方法
    - 未注册 Provider 时抛出包含名称的描述性错误
    - _需求: 7.1, 7.2, 7.4_
  - [ ]* 2.2 编写 Property 5 属性测试：Provider 注册后可创建
    - **Property 5: Provider 注册后可创建**
    - **验证: 需求 7.1, 7.2**
  - [ ]* 2.3 编写 Property 6 属性测试：未注册 Provider 抛出描述性错误
    - **Property 6: 未注册 Provider 抛出描述性错误**
    - **验证: 需求 7.4**

- [x] 3. 实现 RetryHandler
  - [x] 3.1 创建 `packages/ai/src/retry.ts`，实现指数退避重试处理器
    - 实现 `execute` 方法（包装普通异步调用）
    - 实现 `executeStream` 方法（包装流式调用）
    - 实现 `isRetryable` 方法（区分可重试/不可重试错误）
    - 实现 `getDelay` 方法（指数退避计算）
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [ ]* 3.2 编写 Property 10 属性测试：重试次数与错误分类
    - **Property 10: 重试次数与错误分类**
    - **验证: 需求 9.1, 9.4, 9.5, 9.6**
  - [ ]* 3.3 编写 Property 11 属性测试：指数退避延迟单调递增
    - **Property 11: 指数退避延迟单调递增**
    - **验证: 需求 9.2**
  - [ ]* 3.4 编写 Property 12 属性测试：重试耗尽后传播最后错误
    - **Property 12: 重试耗尽后传播最后错误**
    - **验证: 需求 9.3**

- [x] 4. 实现 ConfigLoader
  - [x] 4.1 创建 `packages/ai/src/config.ts`，实现配置加载器
    - 实现 `fromYAML` 方法（从 YAML 文件加载配置）
    - 实现 `resolveEnvVars` 方法（替换 `${ENV_VAR}` 引用）
    - 实现 `applyEnvOverrides` 方法（环境变量覆盖配置）
    - 实现 `validate` 方法（校验必需配置项）
    - _需求: 8.1, 8.2, 8.3, 8.4_
  - [ ]* 4.2 编写 Property 7 属性测试：环境变量引用解析
    - **Property 7: 环境变量引用解析**
    - **验证: 需求 8.2**
  - [ ]* 4.3 编写 Property 8 属性测试：环境变量覆盖优先级
    - **Property 8: 环境变量覆盖优先级**
    - **验证: 需求 8.3**
  - [ ]* 4.4 编写 Property 9 属性测试：必需配置项缺失校验
    - **Property 9: 必需配置项缺失校验**
    - **验证: 需求 8.4**
  - [ ]* 4.5 编写 Property 15 属性测试：YAML 配置解析
    - **Property 15: YAML 配置解析**
    - **验证: 需求 8.1**

- [x] 5. 检查点 — 确保基础设施层测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 6. 实现 OpenAI Provider
  - [x] 6.1 创建 `packages/ai/src/providers/openai.ts`，实现 OpenAIProvider
    - 实现 `chat` 方法（调用 OpenAI API，返回 `ChatResponse`）
    - 实现 `chatStream` 方法（调用 OpenAI 流式 API，返回 `AsyncIterable<ChatChunk>`）
    - 实现内部转换方法：`toOpenAIMessages`、`toOpenAITools`、`fromOpenAIToolCalls`
    - 集成 RetryHandler 进行自动重试
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 6.2 编写 Property 1 属性测试：消息格式转换保留语义内容（OpenAI 部分）
    - **Property 1: 消息格式转换保留语义内容**
    - **验证: 需求 3.2**
  - [ ]* 6.3 编写 Property 3 属性测试：ToolDefinition 转换完整性（OpenAI 部分）
    - **Property 3: ToolDefinition 转换完整性**
    - **验证: 需求 2.4**

- [x] 7. 实现 Anthropic Provider
  - [x] 7.1 创建 `packages/ai/src/providers/anthropic.ts`，实现 AnthropicProvider
    - 实现 `chat` 方法（调用 Anthropic API，返回 `ChatResponse`）
    - 实现 `chatStream` 方法（调用 Anthropic 流式 API，返回 `AsyncIterable<ChatChunk>`）
    - 实现内部转换方法：`toAnthropicMessages`（system 消息单独提取）、`toAnthropicTools`、`fromAnthropicToolUse`
    - 集成 RetryHandler 进行自动重试
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 7.2 编写 Property 1 属性测试：消息格式转换保留语义内容（Anthropic 部分）
    - **Property 1: 消息格式转换保留语义内容**
    - **验证: 需求 4.2**

- [x] 8. 实现 Google Gemini Provider
  - [x] 8.1 创建 `packages/ai/src/providers/google.ts`，实现 GoogleProvider
    - 实现 `chat` 方法（调用 Gemini API，返回 `ChatResponse`）
    - 实现 `chatStream` 方法（调用 Gemini 流式 API，返回 `AsyncIterable<ChatChunk>`）
    - 实现内部转换方法：`toGeminiContents`、`toGeminiTools`、`fromGeminiFunctionCalls`
    - 集成 RetryHandler 进行自动重试
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 8.2 编写 Property 1 属性测试：消息格式转换保留语义内容（Google 部分）
    - **Property 1: 消息格式转换保留语义内容**
    - **验证: 需求 5.2**

- [x] 9. 实现 OpenAI Compatible Provider
  - [x] 9.1 创建 `packages/ai/src/providers/openai-compatible.ts`，实现 OpenAICompatibleProvider
    - 继承 OpenAIProvider，覆盖 baseURL 配置
    - _需求: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 9.2 编写 Property 14 属性测试：自定义 Base URL 路由
    - **Property 14: 自定义 Base URL 路由**
    - **验证: 需求 6.3**

- [x] 10. 检查点 — 确保 Provider 层测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 11. 实现 AIClient 门面类与便捷工厂函数
  - [x] 11.1 创建 `packages/ai/src/client.ts`，实现 AIClient 门面类
    - 实现 `chat` 方法（委托给当前 Provider）
    - 实现 `chatStream` 方法（委托给当前 Provider）
    - 实现 `switchProvider` 方法（运行时切换 Provider）
    - 实现 `getCurrentProvider` 方法
    - 在构造函数中预注册四种内置 Provider
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 7.3, 10.1, 10.2, 10.3_
  - [ ]* 11.2 编写 Property 13 属性测试：Provider 运行时切换
    - **Property 13: Provider 运行时切换**
    - **验证: 需求 10.1, 10.3**
  - [ ]* 11.3 编写 Property 2 属性测试：ToolCall 转换跨 Provider 一致性
    - **Property 2: ToolCall 转换跨 Provider 一致性**
    - **验证: 需求 2.5, 3.4, 4.4, 5.4, 11.3, 11.4**
  - [ ]* 11.4 编写 Property 4 属性测试：流式输出产生合法 ChatChunk 序列
    - **Property 4: 流式输出产生合法 ChatChunk 序列**
    - **验证: 需求 3.3, 4.3, 5.3**

- [x] 12. 统一导出与集成
  - [x] 12.1 更新 `packages/ai/src/index.ts`，导出所有公共 API
    - 导出所有类型（Message、ChatOptions、ChatResponse、ChatChunk、ToolDefinition、ToolCall 等）
    - 导出 AIClient、ProviderRegistry、ConfigLoader、RetryHandler
    - 导出错误类型（AIError、ProviderError、ConfigError、RetryExhaustedError）
    - 导出便捷工厂函数 `createAIClient`、`createAIClientFromConfig`
    - 导出 LLMProvider 接口
    - _需求: 1.1–1.7, 2.1_
  - [x] 12.2 更新 `packages/ai/package.json`，添加 Provider SDK 为 optional peerDependencies
    - 添加 `openai`、`@anthropic-ai/sdk`、`@google/generative-ai` 为 optional peerDependencies
    - 添加 `yaml` 和 `pino` 为 dependencies
    - _需求: 3.5, 4.5, 5.5_

- [x] 13. 最终检查点 — 确保所有测试通过并完成构建验证
  - 确保所有测试通过，如有疑问请向用户确认。
  - 运行 `tsdown` 构建，确认类型声明和产物正确生成。

## 备注

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点任务用于增量验证，确保每个阶段的代码质量
- 属性测试验证跨所有输入的通用正确性属性，单元测试验证具体示例和边界情况
- 所有 Provider SDK 作为 optional peerDependencies，用户只需安装实际使用的 SDK
