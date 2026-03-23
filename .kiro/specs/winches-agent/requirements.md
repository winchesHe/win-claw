# 需求文档 — @winches/agent

## 简介

`@winches/agent` 是 winches-agent monorepo 的运行时核心，作为嵌入式库被 TUI 和 Gateway 直接 import 使用。它负责驱动完整的 AI 对话循环：检索长期记忆、构建 prompt、调用 LLM、解析响应、调度工具执行、处理权限审批，并以流式事件的形式将过程暴露给宿主程序。

Agent 不是独立服务进程，没有 HTTP server。TUI 和 Gateway 各自创建独立的 Agent 实例，各实例拥有独立的对话历史，不共享状态。权限审批通过回调函数实现，由宿主程序驱动 UI 交互。

## 词汇表

- **Agent**：`@winches/agent` 包导出的核心类，驱动完整对话循环
- **AgentConfig**：Agent 构造函数接受的配置对象，包含 LLM provider、storage、工具注册表等依赖
- **AgentEvent**：Agent 在对话循环中 yield 的流式事件，包含文本、工具调用、工具结果、审批请求、完成等类型
- **AgentStatus**：Agent 当前运行状态，包含 idle/running/waiting_approval 三种状态
- **ApprovalRequest**：需要用户审批的工具调用请求，包含工具名、参数、危险等级
- **ConversationLoop**：Agent 内部的核心循环：构建 prompt → 调用 LLM → 解析响应 → 执行工具 → 继续循环
- **DangerLevel**：工具的危险等级，来自 `@winches/core`，分为 safe / confirm / dangerous
- **LLMProvider**：来自 `@winches/ai` 的统一 LLM 接口
- **Memory**：来自 `@winches/storage` 的长期记忆条目
- **Message**：来自 `@winches/ai` 的对话消息，包含 role 和 content
- **SessionId**：标识一次对话会话的唯一字符串 ID
- **StorageService**：来自 `@winches/storage` 的持久化服务接口
- **ToolRegistry**：来自 `@winches/core` 的工具注册中心
- **ToolResult**：来自 `@winches/core` 的工具执行结果，判别联合类型

## 需求

### 需求 1：Agent 实例化与配置

**用户故事：** 作为宿主程序（TUI 或 Gateway）的开发者，我希望通过传入配置对象来创建 Agent 实例，以便在不同宿主环境中灵活组合依赖。

#### 验收标准

1. THE Agent SHALL 接受 `AgentConfig` 对象作为构造函数的唯一参数
2. THE AgentConfig SHALL 包含以下必填字段：`provider`（LLMProvider 实例）、`storage`（StorageService 实例）、`registry`（ToolRegistry 实例）、`sessionId`（string）
3. THE AgentConfig SHALL 包含以下可选字段：`systemPrompt`（string，默认为内置 prompt）、`maxIterations`（number，默认 10，限制单次 chat 调用的最大工具调用轮次）
4. WHEN `AgentConfig` 中缺少必填字段时，THE Agent SHALL 在构造时抛出包含缺失字段名称的 `AgentConfigError`
5. THE Agent SHALL 允许宿主程序在构造后通过赋值 `onApprovalNeeded` 属性来注册审批回调

### 需求 2：流式对话（核心对话循环）

**用户故事：** 作为宿主程序，我希望调用 `agent.chat(messages)` 后能以流式方式接收 Agent 的处理过程，以便实时渲染文本回复和工具调用状态。

#### 验收标准

1. THE Agent SHALL 提供 `chat(messages: Message[]): AsyncIterable<AgentEvent>` 方法
2. WHEN `chat` 被调用时，THE Agent SHALL 首先调用 `storage.recall` 检索与最新用户消息语义相关的长期记忆
3. WHEN `chat` 被调用时，THE Agent SHALL 构建包含 system prompt、检索到的记忆、对话历史和工具定义的完整 prompt
4. THE Agent SHALL 调用 `provider.chatStream` 进行流式 LLM 推理
5. WHEN LLM 返回文本内容时，THE Agent SHALL yield `{ type: "text", content: string }` 事件
6. WHEN LLM 返回工具调用时，THE Agent SHALL yield `{ type: "tool_call", tool: string, params: unknown }` 事件
7. WHEN 工具执行完成时，THE Agent SHALL yield `{ type: "tool_result", result: ToolResult }` 事件
8. WHEN 对话循环正常结束时，THE Agent SHALL yield `{ type: "done" }` 事件作为最后一个事件
9. WHILE Agent 正在处理时，THE Agent SHALL 将 `getStatus()` 返回值维持为 `"running"`
10. WHEN 单次 `chat` 调用的工具调用轮次达到 `maxIterations` 时，THE Agent SHALL 停止继续调用工具并 yield `{ type: "done" }` 事件

### 需求 3：工具调度与权限审批

**用户故事：** 作为宿主程序，我希望 Agent 在执行工具前根据危险等级决定是否需要用户审批，以便在不同 UI 环境中实现一致的权限控制。

#### 验收标准

1. WHEN LLM 请求调用 `dangerLevel` 为 `"safe"` 的工具时，THE Agent SHALL 直接执行该工具，无需审批
2. WHEN LLM 请求调用 `dangerLevel` 为 `"confirm"` 或 `"dangerous"` 的工具时，THE Agent SHALL yield `{ type: "approval_needed", request: ApprovalRequest }` 事件并调用 `onApprovalNeeded` 回调等待结果
3. WHEN `onApprovalNeeded` 回调返回 `true` 时，THE Agent SHALL 执行该工具并将结果喂回 LLM
4. WHEN `onApprovalNeeded` 回调返回 `false` 时，THE Agent SHALL 向 LLM 发送工具被拒绝的消息并继续对话循环，不执行该工具
5. IF `onApprovalNeeded` 回调未注册且工具需要审批时，THEN THE Agent SHALL 自动拒绝该工具调用并向 LLM 发送拒绝消息
6. WHEN 工具执行完成时，THE Agent SHALL 调用 `storage.logToolExecution` 记录工具名称、输入参数、执行结果和耗时
7. WHEN LLM 请求调用未在 `ToolRegistry` 中注册的工具时，THE Agent SHALL 向 LLM 返回包含工具名称的错误消息并继续对话循环

### 需求 4：对话历史持久化

**用户故事：** 作为用户，我希望 Agent 自动保存每轮对话消息，以便在重启后恢复历史上下文。

#### 验收标准

1. WHEN `chat` 被调用时，THE Agent SHALL 调用 `storage.saveMessage` 将每条传入的用户消息保存到当前 `sessionId` 下
2. WHEN LLM 生成完整回复后，THE Agent SHALL 调用 `storage.saveMessage` 将 assistant 消息保存到当前 `sessionId` 下
3. WHEN 工具执行完成后，THE Agent SHALL 调用 `storage.saveMessage` 将 tool 角色消息保存到当前 `sessionId` 下
4. THE Agent SHALL 在构建 prompt 时通过 `storage.getHistory` 加载当前 `sessionId` 的历史消息

### 需求 5：长期记忆检索

**用户故事：** 作为用户，我希望 Agent 在每次对话时自动检索相关的长期记忆并注入 prompt，以便 Agent 能利用跨会话积累的知识。

#### 验收标准

1. WHEN `chat` 被调用时，THE Agent SHALL 以最新用户消息内容为查询调用 `storage.recall`，检索最多 5 条相关记忆
2. WHEN 检索到相关记忆时，THE Agent SHALL 将记忆内容以结构化格式注入 system prompt 的记忆区块
3. WHEN `storage.recall` 返回空数组时，THE Agent SHALL 跳过记忆注入，不在 prompt 中添加记忆区块
4. IF `storage.recall` 调用失败时，THEN THE Agent SHALL 记录警告日志并继续对话，不因记忆检索失败而中断

### 需求 6：Agent 状态查询

**用户故事：** 作为宿主程序，我希望能随时查询 Agent 的当前运行状态，以便在 UI 中显示加载指示器或禁用输入框。

#### 验收标准

1. THE Agent SHALL 提供 `getStatus(): AgentStatus` 方法
2. THE AgentStatus SHALL 为以下三种值之一：`"idle"`、`"running"`、`"waiting_approval"`
3. WHEN Agent 未在处理任何请求时，THE Agent SHALL 通过 `getStatus()` 返回 `"idle"`
4. WHILE Agent 正在执行对话循环时，THE Agent SHALL 通过 `getStatus()` 返回 `"running"`
5. WHILE Agent 正在等待 `onApprovalNeeded` 回调结果时，THE Agent SHALL 通过 `getStatus()` 返回 `"waiting_approval"`

### 需求 7：错误处理与恢复

**用户故事：** 作为宿主程序，我希望 Agent 在遇到 LLM 调用失败或工具执行异常时能优雅处理，以便系统保持稳定运行。

#### 验收标准

1. WHEN `provider.chatStream` 调用失败时，THE Agent SHALL 自动重试最多 3 次，每次重试间隔按指数退避策略增加（1s、2s、4s）
2. WHEN 3 次重试均失败后，THE Agent SHALL yield 包含错误描述的 `{ type: "text", content: string }` 事件通知用户，然后 yield `{ type: "done" }` 事件
3. WHEN 工具执行返回 `{ success: false }` 时，THE Agent SHALL 将 `error` 字段内容作为 tool 消息喂回 LLM，不中断对话循环
4. WHEN 工具执行抛出未捕获异常时，THE Agent SHALL 捕获该异常，记录错误日志，并将异常消息作为 tool 消息喂回 LLM
5. WHEN `chat` 方法执行过程中发生不可恢复错误时，THE Agent SHALL 将 Agent 状态重置为 `"idle"` 后再抛出错误

### 需求 8：Prompt 构建

**用户故事：** 作为开发者，我希望 Agent 按照固定结构构建 prompt，以便 LLM 能获得完整的上下文信息。

#### 验收标准

1. THE Agent SHALL 按以下顺序构建发送给 LLM 的消息列表：system 消息（含 system prompt + 记忆区块）、历史消息、当前用户消息
2. THE Agent SHALL 通过 `registryToToolDefinitions(registry)` 将工具注册表转换为 `ToolDefinition[]` 并通过 `ChatOptions.tools` 传给 LLM
3. WHEN `AgentConfig.systemPrompt` 未提供时，THE Agent SHALL 使用内置默认 system prompt，该 prompt 应描述 Agent 的角色和能力
4. THE Agent SHALL 在 system prompt 的记忆区块中以 `<memory>` XML 标签包裹记忆内容，每条记忆单独一行

### 需求 9：并发保护

**用户故事：** 作为宿主程序，我希望 Agent 防止并发调用 `chat` 方法，以便避免对话历史和状态出现竞态条件。

#### 验收标准

1. WHILE Agent 状态为 `"running"` 或 `"waiting_approval"` 时，WHEN `chat` 被再次调用时，THE Agent SHALL 抛出 `AgentBusyError`
2. THE AgentBusyError SHALL 包含当前 Agent 状态信息

### 需求 10：日志记录

**用户故事：** 作为开发者，我希望 Agent 使用结构化日志记录关键操作，以便在调试和生产环境中追踪问题。

#### 验收标准

1. THE Agent SHALL 使用 pino 进行结构化日志记录
2. WHEN 对话循环开始时，THE Agent SHALL 以 `debug` 级别记录包含 `sessionId` 的日志
3. WHEN 工具被调用时，THE Agent SHALL 以 `debug` 级别记录包含工具名称和 `dangerLevel` 的日志
4. WHEN 工具调用被拒绝时，THE Agent SHALL 以 `info` 级别记录包含工具名称和拒绝原因的日志
5. WHEN LLM 调用失败并触发重试时，THE Agent SHALL 以 `warn` 级别记录包含重试次数和错误信息的日志
6. WHEN 发生不可恢复错误时，THE Agent SHALL 以 `error` 级别记录包含完整错误信息的日志

## 正确性属性（Correctness Properties）

*属性是指在系统所有合法执行中都应成立的特征或行为，是对系统应做什么的形式化陈述。*

### Property 1：chat 方法始终以 done 事件结束

*For any* 合法的 `messages` 输入，`chat` 方法产生的 `AgentEvent` 序列中，最后一个事件的 `type` 应为 `"done"`。

**验证需求：2.8、7.2**

### Property 2：状态机转换合法性

*For any* Agent 实例，`getStatus()` 的返回值应始终为 `"idle"`、`"running"`、`"waiting_approval"` 三者之一，且 `chat` 调用结束后状态应回到 `"idle"`。

**验证需求：6.2、6.3、6.4、6.5**

### Property 3：safe 工具不触发审批回调

*For any* `dangerLevel` 为 `"safe"` 的工具调用，`onApprovalNeeded` 回调不应被调用。

**验证需求：3.1**

### Property 4：confirm/dangerous 工具必须经过审批

*For any* `dangerLevel` 为 `"confirm"` 或 `"dangerous"` 的工具调用，工具执行前 `onApprovalNeeded` 回调必须被调用且返回 `true`。

**验证需求：3.2、3.3**

### Property 5：被拒绝的工具不被执行

*For any* `onApprovalNeeded` 返回 `false` 的工具调用，该工具的 `execute` 方法不应被调用。

**验证需求：3.4**

### Property 6：对话历史保存完整性

*For any* 一次 `chat` 调用，传入的用户消息和 LLM 生成的 assistant 消息都应通过 `storage.saveMessage` 保存，且 `sessionId` 与构造时传入的一致。

**验证需求：4.1、4.2**

### Property 7：并发调用抛出 AgentBusyError

*For any* 正在执行 `chat` 的 Agent 实例，再次调用 `chat` 应抛出 `AgentBusyError`，而不是产生两个并发的对话循环。

**验证需求：9.1**

### Property 8：maxIterations 限制工具调用轮次

*For any* 配置了 `maxIterations = N` 的 Agent，单次 `chat` 调用中工具调用的轮次不应超过 N 次。

**验证需求：2.10**
