# 实现计划：@winches/gateway Telegram Bot 接入层

## 概述

基于 grammy 框架实现 Telegram Bot 接入层，将 Telegram 消息路由到 `@winches/agent` 实例，
支持流式回复更新、工具调用通知、危险操作审批交互、多用户会话管理和优雅退出。

## 任务列表

- [x] 1. 配置包初始化
  - 在 `packages/gateway/package.json` 中添加运行时依赖：`grammy`、`pino`、`yaml`、`@winches/agent`、`@winches/ai`、`@winches/core`、`@winches/storage`
  - 添加开发依赖：`vitest`、`fast-check`、`@types/node`、`pino` 类型
  - 添加 `start` 脚本：`"start": "node dist/index.js"` 和 `test` 脚本
  - 确认 `tsconfig.json` 继承根配置，`tsdown.config.ts` 入口为 `src/index.ts`
  - _需求：1.1_

- [x] 2. 定义核心类型（`src/types.ts`）
  - 定义 `GatewayConfig` 接口（`llm`、`embedding`、`telegram`、`approval`、`storage`、`logging` 字段）
  - 定义 `ChatSession` 接口（`chatId`、`sessionId`、`agent`、`activeMessageId`、`replyBuffer`、`lastEditAt`、`toolMessageMap`）
  - 定义 `PendingApproval` 接口（`approvalId`、`chatId`、`messageId`、`resolve`、`timer`、`settled`）
  - 定义 `CallbackData` 类型（`"approve:${string}" | "reject:${string}"`）
  - _需求：1.1、5.1、6.1_

- [x] 3. 实现配置加载（`src/config.ts`）
  - [x] 3.1 实现 `GatewayConfigError` 类和 `loadConfig(configPath?: string): GatewayConfig` 函数
    - 复用 TUI 的 `loadConfig` 模式，增加 `telegram` 字段解析
    - 支持 `${AGENT_TELEGRAM_TOKEN}` 环境变量引用，`AGENT_TELEGRAM_TOKEN` 环境变量优先覆盖
    - 校验必填字段：`telegram.botToken`、`llm.provider`、`llm.apiKey`，缺失时抛出 `GatewayConfigError`
    - 设置默认值：`approval.timeout = 300`、`approval.defaultAction = "reject"`
    - _需求：1.2、1.3、1.4_
  - [ ]* 3.2 为配置校验编写属性测试（`src/__tests__/config.test.ts`）
    - **Property 1：配置必填字段校验** — 缺少任一必填字段时抛出 `GatewayConfigError`
    - **验证：需求 1.2、1.3**
  - [ ]* 3.3 为环境变量覆盖编写属性测试
    - **Property 2：环境变量覆盖配置** — `AGENT_TELEGRAM_TOKEN` 始终覆盖 `config.yaml` 中的值
    - **验证：需求 1.4**

- [x] 4. 实现会话管理（`src/session.ts`）
  - [x] 4.1 实现 `SessionManager` 类
    - 构造函数接收 `provider: LLMProvider`、`storage: StorageService`、`registry: ToolRegistry`
    - 实现 `getOrCreate(chatId: number): ChatSession`：同一 `chatId` 返回同一实例，`sessionId` 格式为 `telegram-{chatId}-{timestamp}`
    - 实现 `reset(chatId: number): ChatSession`：创建新 Agent 实例，生成新 `sessionId`，覆盖旧 Session
    - 实现 `all(): ChatSession[]`：返回所有活跃 Session
    - _需求：6.1、6.2、6.3、6.5_
  - [ ]* 4.2 为会话唯一性编写属性测试（`src/__tests__/session.test.ts`）
    - **Property 14：会话唯一性与复用** — 同一 `chatId` 多次调用返回同一对象引用，不同 `chatId` 返回不同对象
    - **验证：需求 6.1、6.2**
  - [ ]* 4.3 为 `/new` 命令重置编写属性测试
    - **Property 15：/new 命令重置 sessionId** — `reset()` 后新 `sessionId` 与旧值不同，且格式符合 `telegram-{chatId}-{timestamp}`
    - **验证：需求 6.5**

- [x] 5. 实现流式节流（`src/throttle.ts`）
  - [x] 5.1 实现 `ThrottledBuffer` 类
    - 构造函数接收 `editFn: (text: string) => Promise<void>` 和 `intervalMs: number = 1000`
    - 实现 `append(content: string): void`：追加文本到内部缓冲区
    - 实现 `start(): void`：启动 `setInterval`，每 `intervalMs` 检查 `buffer !== lastSent` 则调用 `editFn`
    - 实现 `async flush(): Promise<void>`：停止定时器，若 `buffer !== lastSent` 则立即调用 `editFn`
    - 实现 `stop(): void`：停止定时器，不刷新
    - _需求：3.1、3.2、3.3、3.4_
  - [ ]* 5.2 为文本追加编写属性测试（`src/__tests__/throttle.test.ts`）
    - **Property 5：文本事件追加到缓冲区** — 任意文本序列追加后，缓冲区内容等于所有内容的顺序拼接
    - **验证：需求 3.1**
  - [ ]* 5.3 为节流间隔编写属性测试
    - **Property 6：流式更新节流** — 任意相邻两次 `editFn` 调用之间的时间间隔不小于 `intervalMs`（使用 fake timers）
    - **验证：需求 3.2**
  - [ ]* 5.4 为 flush 最终更新编写属性测试
    - **Property 7：done 事件触发最终更新** — `flush()` 后 `editFn` 接收到的文本等于所有追加内容的完整拼接
    - **验证：需求 3.3**
  - [ ]* 5.5 为内容未变化跳过更新编写属性测试
    - **Property 8：内容未变化时跳过更新** — 缓冲区与上次发送内容相同时，定时器触发不调用 `editFn`
    - **验证：需求 3.4**

- [x] 6. 实现消息处理器（`src/handlers/message.ts`）
  - [x] 6.1 实现文本消息处理函数 `handleMessage`
    - 检查 `agent.getStatus() !== "idle"` 时回复忙碌提示，不调用 `agent.chat()`
    - 发送占位消息"思考中…"，获取 `messageId`，创建 `ThrottledBuffer` 并启动
    - 注册 `agent.onApprovalNeeded`，调用 `createApprovalHandler`
    - 遍历 `agent.chat()` 事件流：`text` → `buffer.append`，`tool_call` → `sendToolCallMessage`，`tool_result` → `updateToolCallMessage`，`done` → `buffer.flush()`
    - 捕获异常时向 Chat 发送错误提示
    - _需求：2.1、2.3、2.4、3.1、3.2、3.3、4.1、4.2、7.1_
  - [x] 6.2 实现工具通知辅助函数
    - 实现 `truncate(str: string, maxLen: number): string`：超出截断并追加 `...`
    - 实现 `sendToolCallMessage`：格式化工具调用通知，`dangerous` 级别添加 `⚠️` 前缀，记录 `toolMessageMap`
    - 实现 `updateToolCallMessage`：更新工具结果，追加 `✅ 完成` 或 `❌ 失败：{errorMessage}`
    - _需求：4.1、4.2、4.3、4.4_
  - [ ]* 6.3 为消息格式转换编写属性测试（`src/__tests__/handlers.test.ts`）
    - **Property 3：消息格式转换** — 任意非空文本转换为 `Message` 后 `role` 为 `"user"`，`content` 等于原始文本
    - **验证：需求 2.1**
  - [ ]* 6.4 为 Agent 忙碌拒绝编写属性测试
    - **Property 4：Agent 忙碌时拒绝新消息** — Agent 状态为 `running` 或 `waiting_approval` 时不调用 `agent.chat()`
    - **验证：需求 2.3**
  - [ ]* 6.5 为工具通知格式编写属性测试
    - **Property 9：工具通知消息格式** — 任意工具名和危险等级，`dangerous` 时消息以 `⚠️` 开头
    - **验证：需求 4.1、4.4**
  - [ ]* 6.6 为截断函数编写属性测试
    - **Property 10：工具参数/结果截断** — 任意超过 200 字符的字符串，`truncate` 结果长度不超过 200 且以 `...` 结尾
    - **验证：需求 4.3**

- [x] 7. 实现命令处理器（`src/handlers/command.ts`）
  - [x] 7.1 实现 `/start`、`/new`、`/status` 命令处理函数
    - `/start`：发送欢迎消息，包含功能简介和命令列表（`/new`、`/status`）
    - `/new`：调用 `sessionManager.reset(chatId)`，回复"已开启新会话"
    - `/status`：查询 `session.agent.getStatus()` 和 `session.sessionId`，格式化回复
    - _需求：6.4、6.5、6.6_
  - [ ]* 7.2 为命令处理编写单元测试（`src/__tests__/handlers.test.ts`）
    - 测试 `/start` 回复内容包含命令列表
    - 测试 `/new` 触发 `sessionManager.reset` 并回复正确文本
    - 测试 `/status` 回复包含 Agent 状态和 Session ID
    - _需求：6.4、6.5、6.6_

- [x] 8. 实现审批回调处理器（`src/handlers/callback.ts`）
  - [x] 8.1 实现 `createApprovalHandler` 函数
    - 生成 `approvalId`（`crypto.randomUUID()`），发送含 InlineKeyboard 的审批消息
    - 创建 `Promise<boolean>`，设置超时定时器（`config.approval.timeout` 秒）
    - 超时后根据 `config.approval.defaultAction` 自动 resolve，更新消息为"已超时自动{批准/拒绝} ⏱️"
    - 将 `PendingApproval` 存入 `pendingApprovals` Map
    - _需求：5.1、5.4_
  - [x] 8.2 实现 `handleCallbackQuery` 函数
    - 解析 `callback_data`（`approve:{approvalId}` 或 `reject:{approvalId}`）
    - 查找 `pendingApprovals`，若不存在或 `settled === true` 则回应"该审批请求已超时"
    - 标记 `settled = true`，清除 timer，调用 `resolve(true/false)`
    - 更新审批消息为"已批准 ✅"或"已拒绝 ❌"，移除 InlineKeyboard
    - _需求：5.2、5.3、5.6_
  - [ ]* 8.3 为审批按钮结果编写属性测试（`src/__tests__/approval.test.ts`）
    - **Property 11：审批按钮结果一致性** — 点击批准 resolve 为 `true`，点击拒绝 resolve 为 `false`
    - **验证：需求 5.2、5.3**
  - [ ]* 8.4 为审批超时编写属性测试
    - **Property 12：审批超时自动处理** — 超时后 Promise resolve 值等于 `defaultAction === "approve"`
    - **验证：需求 5.4**
  - [ ]* 8.5 为超时后幂等性编写属性测试
    - **Property 13：超时后按钮点击幂等性** — 已超时的审批请求，后续 CallbackQuery 不再调用 `resolve`
    - **验证：需求 5.6**

- [x] 9. 实现 GatewayBot 主类（`src/bot.ts`）
  - [x] 9.1 实现 `GatewayBot` 类
    - 构造函数接收 `config`、`provider`、`storage`、`registry`，初始化 grammy `Bot`、`SessionManager`、`pendingApprovals` Map 和 pino logger
    - 实现 `async start(): Promise<void>`：注册所有 handler（message、command、callback），启动 Polling，注册 `SIGINT`/`SIGTERM`/`uncaughtException`/`unhandledRejection` 信号处理器
    - 实现 `async shutdown(timeoutMs?: number): Promise<void>`：停止 Polling，拒绝所有待审批请求（resolve false），等待活跃请求完成或超时
    - _需求：1.5、7.3、7.4、7.5、8.1、8.2、8.3、8.4、8.5_
  - [ ]* 9.2 为异常后 Agent 状态编写属性测试（`src/__tests__/handlers.test.ts`）
    - **Property 16：异常后 Agent 状态重置** — `agent.chat()` 抛出异常后，`agent.getStatus()` 返回 `"idle"`
    - **验证：需求 7.1**
  - [ ]* 9.3 为关闭时待审批请求编写属性测试
    - **Property 17：关闭时所有待审批请求被拒绝** — `shutdown()` 后所有 pending approval 的 Promise 以 `false` resolve
    - **验证：需求 8.4**

- [x] 10. 检查点 — 核心模块构建验证
  - 运行 `pnpm --filter @winches/gateway build`，确保所有模块无 TypeScript 编译错误
  - 确保所有非可选测试通过，向用户确认是否继续

- [x] 11. 实现入口文件（`src/index.ts`）
  - 实现 `loadDotEnv()` 向上查找并加载 `.env`（复用 TUI 模式）
  - 调用 `loadConfig()` 加载配置，捕获 `GatewayConfigError` 输出到 stderr，以非零退出码退出
  - 初始化 `createAIClient`、`openDatabase` + `MigrationRunner` + `SqliteStorageService`、`createDefaultRegistry`
  - 创建 `GatewayBot` 实例并调用 `bot.start()`
  - StorageService 初始化失败时降级为 null storage 并记录 warn 日志
  - _需求：1.1、1.2、1.3、1.4、1.5、7.2_

- [x] 12. 最终检查点 — 完整构建与测试验证
  - 运行 `pnpm --filter @winches/gateway build`，确保完整构建无错误
  - 运行 `pnpm --filter @winches/gateway test --run`，确保所有非可选测试通过
  - 向用户确认是否有问题

## 备注

- 标记 `*` 的子任务为可选项，可跳过以加快 MVP 进度
- 每个任务均引用具体需求编号以保证可追溯性
- 属性测试使用 fast-check，每个属性最少运行 100 次迭代
- 每个属性测试必须包含注释：`// Feature: winches-gateway, Property {N}: {property_text}`
- 检查点确保增量验证，避免积累错误
