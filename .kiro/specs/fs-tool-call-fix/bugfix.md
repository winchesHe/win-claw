# Bugfix Requirements Document

## Introduction

用户在使用 Agent 的 `file.list` 工具时遇到两个相互关联的 bug。当 LLM 生成了空参数 `{}` 调用 `file.list` 时，`dispatch.ts` 的 JSON 解析通过但工具执行因 `dirPath` 为 undefined 而抛出异常。更严重的是，`openai.ts` 的 `toOpenAIMessages` 方法在转换 assistant 消息时完全丢弃了 `toolCalls` 字段，导致后续 tool role 消息引用的 `tool_call_id` 在 OpenAI API 中找不到对应的 tool_call，触发 400 错误。第二个 bug 是结构性问题，会导致所有涉及工具调用的多轮对话在第二轮循环时失败。

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `dispatch.ts` 解析工具调用参数时，`JSON.parse(toolCall.arguments || "{}")` 对空对象 `{}` 解析成功，随后将缺少必填字段的参数传给 `tool.execute`，THEN 工具内部因 `dirPath` 为 undefined 调用 `fs.stat(undefined)` 抛出运行时错误，错误信息不明确且未指出真正原因是参数校验失败

1.2 WHEN `dispatch.ts` 接收到 LLM 生成的无效 JSON 字符串（非空但格式错误）作为工具参数时，`JSON.parse` 抛出异常，THEN 系统返回 `Invalid JSON arguments for tool "file.list"` 错误，但没有在 JSON 解析成功后进一步校验参数是否满足工具的 `required` 字段约束

1.3 WHEN `loop.ts` 将 assistant 消息（含 toolCalls）追加到 `loopMessages` 时，使用 `{ role: "assistant", content: content || "", toolCalls } as Message` 构造消息，但 `Message` 类型没有 `toolCalls` 字段，THEN `toolCalls` 数据虽然存在于运行时对象上，但在类型层面被忽略

1.4 WHEN `openai.ts` 的 `toOpenAIMessages` 方法处理 role 为 `assistant` 的消息时，只提取了 `content` 字段，完全忽略了消息上的 `toolCalls` 字段，THEN 发送给 OpenAI API 的 assistant 消息缺少 `tool_calls` 字段，后续 tool role 消息引用的 `tool_call_id` 找不到对应的 tool_call，API 返回 400 错误 `No tool call found for function call output with call_id`

### Expected Behavior (Correct)

2.1 WHEN `dispatch.ts` 解析工具调用参数后，JSON 解析成功但参数不满足工具 schema 中 `required` 字段约束时，THEN 系统 SHALL 在执行工具前校验必填参数是否存在，并返回明确的错误信息指出缺少哪些必填参数（例如 `Missing required parameter "dirPath" for tool "file.list"`）

2.2 WHEN `dispatch.ts` 接收到无效 JSON 字符串时，THEN 系统 SHALL CONTINUE TO 返回 JSON 解析失败的错误信息

2.3 WHEN `loop.ts` 将 assistant 消息（含 toolCalls）追加到 `loopMessages` 时，THEN `Message` 类型 SHALL 包含可选的 `toolCalls` 字段，使得 toolCalls 数据能在类型安全的方式下传递

2.4 WHEN `openai.ts` 的 `toOpenAIMessages` 方法处理 role 为 `assistant` 且包含 `toolCalls` 的消息时，THEN 系统 SHALL 将 `toolCalls` 转换为 OpenAI 格式的 `tool_calls` 字段，确保后续 tool role 消息的 `tool_call_id` 能正确关联

### Unchanged Behavior (Regression Prevention)

3.1 WHEN 工具调用参数是合法 JSON 且满足所有 `required` 字段约束时，THEN 系统 SHALL CONTINUE TO 正常解析参数并执行工具

3.2 WHEN assistant 消息不包含 toolCalls（纯文本回复）时，THEN `toOpenAIMessages` SHALL CONTINUE TO 正常转换为 OpenAI 格式的 assistant 消息，不包含 `tool_calls` 字段

3.3 WHEN tool role 消息包含 `toolCallId` 时，THEN `toOpenAIMessages` SHALL CONTINUE TO 正确转换为 OpenAI 格式的 tool 消息，包含 `tool_call_id` 字段

3.4 WHEN 工具执行成功或失败时，THEN 系统 SHALL CONTINUE TO 正确记录执行日志到 storage

3.5 WHEN 工具的 `dangerLevel` 不是 `safe` 时，THEN 系统 SHALL CONTINUE TO 触发审批流程
