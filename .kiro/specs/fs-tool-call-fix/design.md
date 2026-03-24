# fs-tool-call-fix Bugfix Design

## Overview

本设计修复两个相互关联的 bug：(1) `dispatch.ts` 在 JSON 解析成功后缺少对工具 `required` 参数的校验，导致缺少必填参数时工具内部抛出不明确的运行时错误；(2) `openai.ts` 的 `toOpenAIMessages` 方法在转换 assistant 消息时丢弃了 `toolCalls` 字段，导致后续 tool role 消息的 `tool_call_id` 在 OpenAI API 中找不到对应的 tool_call，触发 400 错误。修复策略是在 dispatch 层增加参数校验，在 AI 类型层补充 `toolCalls` 字段，并在 OpenAI provider 中正确转换该字段。

## Glossary

- **Bug_Condition (C)**: 触发 bug 的条件——(C1) JSON 解析成功但缺少 required 参数；(C2) assistant 消息包含 toolCalls 但转换时被丢弃
- **Property (P)**: 期望行为——(P1) 缺少必填参数时返回明确错误信息；(P2) assistant 消息的 toolCalls 被正确转换为 OpenAI 格式的 tool_calls
- **Preservation**: 现有行为不受影响——合法参数正常执行、纯文本 assistant 消息正常转换、tool 消息正常转换、审批流程不变
- **`executeToolCall`**: `packages/agent/src/dispatch.ts` 中执行单个工具调用的函数，负责查找工具、解析参数、审批、执行
- **`toOpenAIMessages`**: `packages/ai/src/providers/openai.ts` 中将统一 `Message[]` 转换为 OpenAI API 消息格式的方法
- **`Message`**: `packages/ai/src/types.ts` 中定义的对话消息类型，当前缺少 `toolCalls` 字段
- **`Tool.parameters`**: `packages/core/src/types.ts` 中 `Tool` 接口的 JSON Schema 参数定义，包含 `required` 数组

## Bug Details

### Bug Condition

两个 bug 分别在不同条件下触发：

**Bug 1 — dispatch 参数校验缺失**：当 LLM 生成的工具调用参数是合法 JSON 但缺少工具 schema 中 `required` 字段指定的必填参数时触发。例如 `file.list` 的 `required: ["dirPath"]`，但 LLM 传入 `{}`。

**Bug 2 — toOpenAIMessages 丢失 toolCalls**：当 assistant 消息包含 `toolCalls`（即 LLM 请求调用工具）时，`toOpenAIMessages` 的 assistant case 只提取 `content`，完全忽略 `toolCalls`，导致发送给 OpenAI 的消息缺少 `tool_calls`。

**Formal Specification:**
```
FUNCTION isBugCondition_ParameterValidation(toolCall, tool)
  INPUT: toolCall of type ToolCall, tool of type Tool
  OUTPUT: boolean

  params := JSON.parse(toolCall.arguments)
  requiredFields := tool.parameters.required OR []

  FOR EACH field IN requiredFields DO
    IF params[field] IS undefined OR null THEN
      RETURN true
    END IF
  END FOR

  RETURN false
END FUNCTION

FUNCTION isBugCondition_MissingToolCalls(message)
  INPUT: message of type Message
  OUTPUT: boolean

  RETURN message.role == "assistant"
         AND message.toolCalls IS defined
         AND message.toolCalls.length > 0
END FUNCTION
```

### Examples

- `file.list` 调用参数为 `{}`：`dirPath` 为 required 但缺失 → 当前行为：`fs.stat(undefined)` 抛出 `TypeError`；期望行为：返回 `Missing required parameter "dirPath" for tool "file.list"`
- `file.write` 调用参数为 `{"filePath": "/tmp/a.txt"}`：`content` 为 required 但缺失 → 当前行为：写入 `undefined`；期望行为：返回 `Missing required parameter "content" for tool "file.write"`
- `file.read` 调用参数为 `{"filePath": "/tmp/a.txt"}`：所有 required 字段满足 → 当前行为：正常执行；期望行为：继续正常执行（不受影响）
- assistant 消息含 `toolCalls: [{id: "call_1", name: "file.list", arguments: "{}"}]` → 当前行为：转换后无 `tool_calls`，后续 tool 消息的 `tool_call_id: "call_1"` 导致 OpenAI 400 错误；期望行为：转换后包含 `tool_calls`

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- 合法 JSON 且满足所有 `required` 字段的工具调用必须继续正常解析并执行
- 无效 JSON 字符串的工具调用必须继续返回 `Invalid JSON arguments` 错误
- 纯文本 assistant 消息（不含 toolCalls）必须继续正常转换为 OpenAI 格式，不包含 `tool_calls`
- tool role 消息必须继续正确转换，包含 `tool_call_id`
- 工具执行日志记录到 storage 的行为不变
- 非 safe 工具的审批流程不变

**Scope:**
所有不涉及以下条件的输入不受影响：
- JSON 解析成功但缺少 required 参数的工具调用
- 包含 toolCalls 的 assistant 消息转换

## Hypothesized Root Cause

Based on the bug description, the most likely issues are:

1. **dispatch.ts 缺少参数校验层**: `executeToolCall` 在 `JSON.parse` 成功后直接将 `params` 传给 `tool.execute`，没有根据 `tool.parameters.required` 校验必填字段是否存在。这是一个遗漏的校验步骤。

2. **Message 类型定义不完整**: `packages/ai/src/types.ts` 中的 `Message` 接口只有 `role`、`content`、`toolCallId` 三个字段，缺少可选的 `toolCalls` 字段。`loop.ts` 通过 `as Message` 强制类型断言绕过了类型检查，但下游的 `toOpenAIMessages` 无法感知该字段。

3. **toOpenAIMessages assistant case 不完整**: `openai.ts` 的 `toOpenAIMessages` 方法在 `case "assistant"` 分支中只返回 `{ role: "assistant", content }`，没有检查和转换 `msg.toolCalls` 为 OpenAI 格式的 `tool_calls`。

4. **两个 bug 的关联性**: Bug 1 导致工具执行失败产生错误结果，错误结果作为 tool 消息追加到对话中；Bug 2 导致包含 toolCalls 的 assistant 消息在下一轮发送给 OpenAI 时丢失 tool_calls，使得 tool 消息的 tool_call_id 无法关联，触发 API 400 错误。两个 bug 叠加导致多轮工具调用对话完全无法工作。

## Correctness Properties

Property 1: Bug Condition - 缺少必填参数时返回明确错误

_For any_ tool call where JSON parsing succeeds but one or more required parameters (as defined in `tool.parameters.required`) are missing from the parsed object, the fixed `executeToolCall` function SHALL return a `DispatchResult` with `toolResult.success === false` and `toolResult.error` containing the missing parameter name(s), WITHOUT invoking `tool.execute`.

**Validates: Requirements 2.1**

Property 2: Bug Condition - assistant 消息的 toolCalls 正确转换

_For any_ Message with `role === "assistant"` and a non-empty `toolCalls` array, the fixed `toOpenAIMessages` method SHALL produce an OpenAI message containing a `tool_calls` array where each element has `type: "function"`, `id` matching the original `toolCall.id`, and `function.name`/`function.arguments` matching the original `toolCall.name`/`toolCall.arguments`.

**Validates: Requirements 2.4**

Property 3: Preservation - 合法参数正常执行

_For any_ tool call where JSON parsing succeeds AND all required parameters are present, the fixed `executeToolCall` function SHALL produce the same result as the original function, passing params to `tool.execute` without modification.

**Validates: Requirements 3.1**

Property 4: Preservation - 纯文本 assistant 消息正常转换

_For any_ Message with `role === "assistant"` and no `toolCalls` (undefined or empty), the fixed `toOpenAIMessages` method SHALL produce exactly the same OpenAI message as the original function, with no `tool_calls` field.

**Validates: Requirements 3.2**

Property 5: Preservation - tool 消息正常转换

_For any_ Message with `role === "tool"`, the fixed `toOpenAIMessages` method SHALL produce the same result as the original function, preserving `tool_call_id` and content.

**Validates: Requirements 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/ai/src/types.ts`

**Type**: `Message`

**Specific Changes**:
1. **添加 `toolCalls` 可选字段**: 在 `Message` 接口中添加 `toolCalls?: ToolCall[]`，使 assistant 消息能以类型安全的方式携带工具调用信息

---

**File**: `packages/agent/src/dispatch.ts`

**Function**: `executeToolCall`

**Specific Changes**:
2. **添加 required 参数校验**: 在 `JSON.parse` 成功后、权限审批前，读取 `tool.parameters.required`（如果存在），遍历检查每个 required 字段是否存在于 parsed params 中
3. **返回明确错误信息**: 如果有缺失的 required 字段，返回 `{ success: false, error: 'Missing required parameter "fieldName" for tool "toolName"' }` 格式的错误，不执行工具

---

**File**: `packages/ai/src/providers/openai.ts`

**Method**: `OpenAIProvider.toOpenAIMessages`

**Specific Changes**:
4. **处理 assistant 消息的 toolCalls**: 在 `case "assistant"` 分支中，检查 `msg.toolCalls` 是否存在且非空，如果是则将其转换为 OpenAI 格式的 `tool_calls` 数组
5. **toolCalls 转换格式**: 每个 `ToolCall` 转换为 `{ type: "function", id: tc.id, function: { name: tc.name, arguments: tc.arguments } }`

---

**File**: `packages/agent/src/loop.ts`

**Specific Changes**:
6. **移除 `as Message` 类型断言**: 在 `Message` 类型添加 `toolCalls` 字段后，`loop.ts` 中构造 assistant 消息时不再需要 `as Message` 强制断言，可以直接使用类型安全的对象字面量

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that call `executeToolCall` with missing required parameters and call `toOpenAIMessages` with assistant messages containing toolCalls. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Missing Required Param Test**: Call `executeToolCall` with `file.list` tool and arguments `{}` — expect tool execution failure with unclear error (will fail on unfixed code with `fs.stat(undefined)` TypeError)
2. **Multiple Missing Params Test**: Call `executeToolCall` with `file.write` tool and arguments `{}` — expect unclear failure (will fail on unfixed code)
3. **Assistant ToolCalls Conversion Test**: Call `toOpenAIMessages` with assistant message containing `toolCalls` — expect missing `tool_calls` in output (will fail on unfixed code)
4. **Multi-turn Tool Call Test**: Simulate a full loop with assistant toolCalls followed by tool result — expect OpenAI API 400 error pattern (will fail on unfixed code)

**Expected Counterexamples**:
- `executeToolCall` passes undefined params to `tool.execute`, causing runtime TypeError inside the tool
- `toOpenAIMessages` produces assistant messages without `tool_calls`, causing subsequent tool messages to be orphaned
- Possible causes: missing validation step in dispatch, missing field in Message type, incomplete assistant case in toOpenAIMessages

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL (toolCall, tool) WHERE isBugCondition_ParameterValidation(toolCall, tool) DO
  result := executeToolCall_fixed(toolCall, ctx)
  ASSERT result.toolResult.success == false
  ASSERT result.toolResult.error CONTAINS missing parameter name
  ASSERT tool.execute WAS NOT CALLED
END FOR

FOR ALL message WHERE isBugCondition_MissingToolCalls(message) DO
  openaiMessages := toOpenAIMessages_fixed([message])
  ASSERT openaiMessages[0].tool_calls IS defined
  ASSERT openaiMessages[0].tool_calls.length == message.toolCalls.length
  FOR EACH (original, converted) IN zip(message.toolCalls, openaiMessages[0].tool_calls) DO
    ASSERT converted.id == original.id
    ASSERT converted.function.name == original.name
    ASSERT converted.function.arguments == original.arguments
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL (toolCall, tool) WHERE NOT isBugCondition_ParameterValidation(toolCall, tool) DO
  ASSERT executeToolCall_original(toolCall, ctx) == executeToolCall_fixed(toolCall, ctx)
END FOR

FOR ALL message WHERE NOT isBugCondition_MissingToolCalls(message) DO
  ASSERT toOpenAIMessages_original([message]) == toOpenAIMessages_fixed([message])
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for valid tool calls and non-toolCalls messages, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Valid Params Preservation**: Generate random tool calls with all required params present, verify `executeToolCall` passes params to `tool.execute` unchanged
2. **Plain Assistant Preservation**: Generate assistant messages without toolCalls, verify `toOpenAIMessages` output is identical before and after fix
3. **Tool Message Preservation**: Generate tool role messages with toolCallId, verify `toOpenAIMessages` output is identical before and after fix
4. **Invalid JSON Preservation**: Generate invalid JSON strings as arguments, verify error message is unchanged

### Unit Tests

- Test `executeToolCall` with missing single required parameter returns clear error
- Test `executeToolCall` with missing multiple required parameters returns clear error
- Test `executeToolCall` with tool that has no `required` field passes through
- Test `executeToolCall` with all required params present executes normally
- Test `toOpenAIMessages` with assistant message containing toolCalls produces correct `tool_calls`
- Test `toOpenAIMessages` with assistant message without toolCalls produces no `tool_calls`
- Test `toOpenAIMessages` with tool message preserves `tool_call_id`

### Property-Based Tests

- Generate random tool parameter objects with random subsets of required fields missing, verify `executeToolCall` rejects with correct error for each missing field
- Generate random valid tool parameter objects with all required fields, verify `executeToolCall` passes params through to `tool.execute`
- Generate random assistant messages with random toolCalls arrays, verify `toOpenAIMessages` produces correct `tool_calls` mapping
- Generate random non-assistant messages, verify `toOpenAIMessages` output matches original behavior

### Integration Tests

- Test full conversation loop: user message → LLM returns toolCalls → dispatch validates params → tool executes → tool result sent back → LLM responds
- Test conversation loop with invalid params: user message → LLM returns toolCalls with missing params → dispatch rejects → error tool result sent back
- Test multi-turn conversation: verify assistant messages with toolCalls are correctly preserved across loop iterations when sent back to OpenAI
