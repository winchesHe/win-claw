# 实现计划：@winches/agent

## 概述

按照设计文档，从基础层（类型、工具函数）到核心层（对话循环、Agent 类）逐步实现，每一步都在前一步的基础上构建，最终通过 index.ts 统一导出。

## 任务

- [x] 1. 配置 package.json 依赖
  - 在 `packages/agent/package.json` 中添加 `dependencies`：`@winches/ai`、`@winches/core`、`@winches/storage`、`pino`（^9.x）
  - 在 `packages/agent/package.json` 中添加 `devDependencies`：`fast-check`、`@types/node`
  - 确保 workspace 包使用 `workspace:*` 版本约束
  - _需求：1.1、1.2、1.3_

- [x] 2. 定义核心类型与错误类型
  - [x] 2.1 实现 `types.ts`
    - 定义 `AgentConfig` 接口（provider、storage、registry、sessionId 必填；systemPrompt、maxIterations 可选）
    - 定义 `AgentStatus` 类型（`"idle" | "running" | "waiting_approval"`）
    - 定义 `ApprovalRequest` 接口（toolName、params、dangerLevel）
    - 定义 `AgentEvent` 判别联合类型（text、tool_call、tool_result、approval_needed、done）
    - _需求：1.1、1.2、1.3、2.1、3.2、6.1、6.2_
  - [x] 2.2 实现 `errors.ts`
    - 定义 `AgentError` 基础错误类（继承 Error，设置 name）
    - 定义 `AgentConfigError`（继承 AgentError，包含 `missingField: string` 字段）
    - 定义 `AgentBusyError`（继承 AgentError，包含 `currentStatus: AgentStatus` 字段）
    - _需求：1.4、9.1、9.2_

- [x] 3. 实现 `prompt.ts`（buildMessages）
  - [x] 3.1 实现 `buildMessages` 函数
    - 函数签名：`buildMessages(systemPrompt, memories, history, currentMessages): Message[]`
    - 按顺序组装：system 消息（含记忆区块）→ 历史消息 → 当前消息
    - 当 `memories` 非空时，以 `<memory>` XML 标签包裹，每条记忆单独一行追加到 systemPrompt 末尾
    - 当 `memories` 为空时，不添加记忆区块
    - _需求：5.2、5.3、8.1、8.3、8.4_
  - [ ]* 3.2 为 `buildMessages` 编写单元测试（`prompt.test.ts`）
    - 测试消息顺序正确性（system → history → current）
    - 测试有记忆时 `<memory>` 标签注入
    - 测试空记忆时不注入记忆区块
    - _需求：5.2、5.3、8.1、8.4_

- [x] 4. 实现 `stream.ts`（aggregateStream）
  - [x] 4.1 实现 `aggregateStream` async generator 函数
    - 函数签名：`async function* aggregateStream(stream): AsyncGenerator<{type:"text_delta";content:string}, AggregatedResponse>`
    - 定义 `AggregatedResponse` 接口（content: string, toolCalls: ToolCall[]）
    - 按 index 分组累积工具调用（id、name、arguments 字符串拼接）
    - 每个文本 chunk yield `{ type: "text_delta", content }` 事件
    - 流结束后提取完整 ToolCall 列表并通过 return value 返回
    - _需求：2.4、2.5、2.6_
  - [ ]* 4.2 为 `aggregateStream` 编写单元测试（`stream.test.ts`）
    - 测试纯文本流聚合（yield 文本增量，return 完整 content）
    - 测试工具调用流聚合（多 chunk 拼接 arguments）
    - 测试混合响应（文本 + 工具调用同时存在）
    - 测试空流（返回空 content 和空 toolCalls）
    - _需求：2.4、2.5、2.6_

- [x] 5. 实现 `dispatch.ts`（executeToolCall）
  - [x] 5.1 实现 `executeToolCall` 函数
    - 函数签名：`executeToolCall(toolCall: ToolCall, ctx: DispatchContext): Promise<DispatchResult>`
    - 定义 `DispatchContext` 接口（registry、storage、sessionId、setStatus、onApprovalNeeded、logger）
    - 定义 `DispatchResult` 接口（toolResult: ToolResult, rejected: boolean）
    - 步骤 1：从 registry 查找工具，未找到返回错误 ToolResult
    - 步骤 2：JSON.parse arguments，解析失败返回错误 ToolResult
    - 步骤 3：dangerLevel 非 safe 时调用 onApprovalNeeded，未注册回调则自动拒绝
    - 步骤 4：执行工具，捕获所有异常转为 ToolResult
    - 步骤 5：调用 storage.logToolExecution 记录执行日志（失败时仅 warn，不中断）
    - _需求：3.1、3.2、3.3、3.4、3.5、3.6、3.7、10.3、10.4_
  - [ ]* 5.2 为 `executeToolCall` 编写单元测试（`dispatch.test.ts`）
    - 测试 safe 工具直接执行，不调用 onApprovalNeeded
    - 测试 confirm/dangerous 工具调用 onApprovalNeeded 后执行
    - 测试 onApprovalNeeded 返回 false 时工具不被执行
    - 测试工具未注册时返回错误 ToolResult
    - 测试 arguments JSON 解析失败时返回错误 ToolResult
    - 测试工具执行抛出异常时捕获并返回错误 ToolResult
    - _需求：3.1、3.2、3.3、3.4、3.5、3.7_
  - [ ]* 5.3 为 `executeToolCall` 编写属性测试（`dispatch.test.ts`）
    - **Property 3：safe 工具不触发审批回调**
    - **验证需求：3.1**
  - [ ]* 5.4 为 `executeToolCall` 编写属性测试（`dispatch.test.ts`）
    - **Property 4：confirm/dangerous 工具必须经过审批**
    - **验证需求：3.2、3.3**
  - [ ]* 5.5 为 `executeToolCall` 编写属性测试（`dispatch.test.ts`）
    - **Property 5：被拒绝的工具不被执行**
    - **验证需求：3.4**
  - [ ]* 5.6 为 `executeToolCall` 编写属性测试（`dispatch.test.ts`）
    - **Property 6：对话历史保存完整性**（dispatch 层：验证 logToolExecution 的 sessionId 一致性）
    - **验证需求：4.1、4.2**

- [x] 6. 检查点 — 确保基础层测试通过
  - 运行 `vitest --run packages/agent` 确保 prompt.test.ts、stream.test.ts、dispatch.test.ts 全部通过
  - 如有失败，修复后再继续

- [x] 7. 实现 `loop.ts`（conversationLoop）
  - [x] 7.1 实现 `conversationLoop` async generator 函数
    - 函数签名：`async function* conversationLoop(ctx: LoopContext): AsyncGenerator<AgentEvent>`
    - 定义 `LoopContext` 接口（messages、config、getStatus、setStatus、onApprovalNeeded、logger）
    - 保存用户消息到 storage（saveMessage）
    - 检索记忆（storage.recall，失败时 warn 并继续）
    - 加载历史（storage.getHistory）
    - 调用 buildMessages 构建初始 prompt
    - 调用 registryToToolDefinitions 获取工具定义
    - 主循环（最多 maxIterations 轮）：
      - 带指数退避重试的 chatStream 调用（最多 3 次，间隔 1s/2s/4s）
      - 全部重试失败时 yield 错误文本事件 + done 并 return
      - 调用 aggregateStream 聚合响应，yield text 事件
      - 纯文本回复时保存 assistant 消息并 break
      - 工具调用时 yield tool_call 事件，调用 executeToolCall，yield tool_result 事件
      - 将工具结果追加到 loopMessages 继续下一轮
    - 循环结束后 yield `{ type: "done" }`
    - _需求：2.1、2.2、2.3、2.4、2.5、2.6、2.7、2.8、2.9、2.10、4.1、4.2、4.3、4.4、5.1、5.4、7.1、7.2、7.3、7.4、8.1、8.2_
  - [ ]* 7.2 为 `conversationLoop` 编写单元测试（`loop.test.ts`）
    - 测试纯文本回复场景（yield text + done）
    - 测试工具调用场景（yield tool_call + tool_result + done）
    - 测试 LLM 重试逻辑（前 N 次失败，第 N+1 次成功）
    - 测试全部重试失败时 yield 错误文本 + done
    - 测试记忆检索失败时继续对话（降级处理）
    - _需求：2.8、5.4、7.1、7.2_
  - [ ]* 7.3 为 `conversationLoop` 编写属性测试（`loop.test.ts`）
    - **Property 1：chat 方法始终以 done 事件结束**
    - **验证需求：2.8、7.2**
  - [ ]* 7.4 为 `conversationLoop` 编写属性测试（`loop.test.ts`）
    - **Property 8：maxIterations 限制工具调用轮次**
    - **验证需求：2.10**

- [x] 8. 实现 `agent.ts`（Agent 类）
  - [x] 8.1 实现 `Agent` 类
    - 构造函数：校验必填字段（provider、storage、registry、sessionId），缺失时抛出 AgentConfigError
    - 构造函数：填充默认值（systemPrompt、maxIterations=10）
    - 私有字段：config（Required<AgentConfig>）、status（AgentStatus，初始 idle）、logger（pino）
    - 公开字段：onApprovalNeeded（审批回调，可赋值）
    - `chat(messages)` 方法：非 idle 状态时抛出 AgentBusyError；设置 status = "running"；yield* conversationLoop；finally 块重置 status = "idle"
    - `getStatus()` 方法：返回当前 status
    - _需求：1.1、1.2、1.3、1.4、1.5、2.1、6.1、6.2、6.3、6.4、6.5、7.5、9.1、9.2、10.1、10.2_
  - [ ]* 8.2 为 `Agent` 类编写单元测试（`agent.test.ts`）
    - 测试构造函数必填字段校验（每个字段缺失时抛出 AgentConfigError）
    - 测试默认值填充（systemPrompt、maxIterations）
    - 测试 chat 方法事件序列（文本回复场景）
    - 测试 chat 完成后状态重置为 idle
    - 测试 chat 抛出异常后状态重置为 idle（finally 块）
    - _需求：1.1、1.2、1.3、1.4、6.3、7.5_
  - [ ]* 8.3 为 `Agent` 类编写属性测试（`agent.test.ts`）
    - **Property 2：状态机转换合法性**
    - **验证需求：6.2、6.3、6.4、6.5**
  - [ ]* 8.4 为 `Agent` 类编写属性测试（`agent.test.ts`）
    - **Property 7：并发调用抛出 AgentBusyError**
    - **验证需求：9.1**

- [x] 9. 检查点 — 确保核心层测试通过
  - 运行 `vitest --run packages/agent` 确保 loop.test.ts、agent.test.ts 全部通过
  - 如有失败，修复后再继续

- [x] 10. 统一导出（index.ts）
  - 更新 `packages/agent/src/index.ts`，导出 `Agent` 类
  - 导出类型：`AgentConfig`、`AgentEvent`、`AgentStatus`、`ApprovalRequest`
  - 导出错误类：`AgentError`、`AgentConfigError`、`AgentBusyError`
  - 内部模块（loop、prompt、stream、dispatch）不对外导出
  - _需求：1.1、1.4、1.5、9.2_

- [x] 11. 最终检查点 — 所有测试通过 + 构建验证
  - 运行 `vitest --run packages/agent` 确保所有测试文件全部通过
  - 运行 `pnpm --filter @winches/agent build` 验证 tsdown 构建成功，`dist/` 目录生成正确

## 备注

- 标记 `*` 的子任务为可选项，可跳过以加快 MVP 进度
- 每个任务均引用具体需求编号以保证可追溯性
- 检查点任务用于增量验证，确保每层构建完成后测试通过
- 属性测试使用 fast-check，每个属性最少 100 次迭代
- 所有外部依赖（LLMProvider、StorageService、ToolRegistry）通过接口 mock，不依赖真实 LLM 或数据库
