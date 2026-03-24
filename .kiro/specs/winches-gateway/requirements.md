# 需求文档

## 简介

`@winches/gateway` 是 winches-agent 项目的 Telegram Bot 接入层，作为常驻进程 7×24 小时在线运行。
基于 grammy（TypeScript 原生 Telegram Bot 框架）实现，直接嵌入 `@winches/agent` 实例，提供消息接收、流式回复更新、工具调用通知、危险操作审批交互、多用户会话管理和优雅退出等核心功能。

## 词汇表

- **Gateway**：本包 `@winches/gateway`，Telegram Bot 接入层
- **Bot**：通过 Telegram Bot API 运行的机器人实例，由 grammy 框架管理
- **Agent**：`@winches/agent` 包导出的 `Agent` 类实例，负责对话循环与工具调度
- **AgentEvent**：Agent 流式输出的事件，类型为 `text | tool_call | tool_result | approval_needed | done`
- **ApprovalRequest**：需要用户审批的工具调用请求，包含工具名、参数和危险等级
- **Session**：一次独立的对话上下文，由 `sessionId` 标识，每个 Telegram Chat 对应一个独立 Session
- **ChatId**：Telegram 消息中唯一标识一个对话（用户私聊或群组）的整数 ID
- **InlineKeyboard**：Telegram 消息附带的内联按钮组，用于审批交互
- **CallbackQuery**：用户点击 InlineKeyboard 按钮后触发的 Telegram 回调事件
- **StorageService**：`@winches/storage` 提供的持久化服务接口
- **DangerLevel**：工具危险等级，分为 `safe`、`confirm`、`dangerous`
- **editMessageText**：Telegram Bot API 方法，用于原地更新已发送消息的文本内容
- **Polling**：grammy 默认的消息拉取模式，通过长轮询从 Telegram 服务器获取更新

---

## 需求

### 需求 1：启动与初始化

**用户故事：** 作为运维人员，我希望通过命令启动 Gateway 进程，自动完成配置读取和 Bot 连接，以便 Telegram Bot 上线服务。

#### 验收标准

1. WHEN 用户执行 `npm run start:gateway`，THE Gateway SHALL 读取项目根目录的 `config.yaml`，完成 Agent 初始化并启动 Telegram Bot Polling
2. WHEN `config.yaml` 中的 `telegram.botToken` 字段缺失或为空，THE Gateway SHALL 在标准错误输出打印明确的错误信息并以非零退出码退出
3. WHEN `config.yaml` 中的 LLM 必填字段（`llm.provider`、`llm.apiKey`）缺失，THE Gateway SHALL 在标准错误输出打印明确的错误信息并以非零退出码退出
4. WHEN 环境变量 `AGENT_TELEGRAM_TOKEN` 存在，THE Gateway SHALL 使用该环境变量值覆盖 `config.yaml` 中的 `telegram.botToken`
5. WHEN Bot 成功连接 Telegram 服务器，THE Gateway SHALL 通过 pino 日志输出 info 级别的启动成功消息，包含 Bot 用户名

---

### 需求 2：接收 Telegram 消息并转发给 Agent

**用户故事：** 作为用户，我希望在 Telegram 中向 Bot 发送消息，Bot 能将消息转发给 Agent 处理，以便获得 AI 回复。

#### 验收标准

1. WHEN Bot 收到用户发送的文本消息，THE Gateway SHALL 将消息内容转换为 `Message` 格式并调用对应 Session 的 `agent.chat()`
2. WHEN Bot 收到非文本消息（图片、文件、贴纸等），THE Gateway SHALL 回复"暂不支持该消息类型，请发送文字消息"
3. WHEN `agent.chat()` 被调用时 Agent 状态为 `running` 或 `waiting_approval`，THE Gateway SHALL 回复"Agent 正在处理上一条消息，请稍候"，不重复调用 `agent.chat()`
4. WHEN Bot 收到消息时，THE Gateway SHALL 先发送一条占位消息（如"思考中…"），后续通过 `editMessageText` 更新该消息内容

---

### 需求 3：流式回复更新

**用户故事：** 作为用户，我希望在 Telegram 中实时看到 Agent 的回复逐步更新，以便了解生成进度。

#### 验收标准

1. WHEN Agent 发出 `type: "text"` 事件，THE Gateway SHALL 将 `content` 字段追加到当前回复缓冲区
2. WHILE 回复缓冲区有新内容且距上次 `editMessageText` 调用已超过 1 秒，THE Gateway SHALL 调用 `editMessageText` 更新 Telegram 消息内容
3. WHEN Agent 发出 `type: "done"` 事件，THE Gateway SHALL 立即执行最后一次 `editMessageText`，将完整回复内容写入消息
4. IF 回复缓冲区内容与当前 Telegram 消息内容相同，THEN THE Gateway SHALL 跳过本次 `editMessageText` 调用，避免触发 Telegram API 限流
5. IF `editMessageText` 调用返回 Telegram API 错误（非内容相同导致的 400 错误），THEN THE Gateway SHALL 通过 pino 记录 warn 级别日志，并继续处理后续事件

---

### 需求 4：工具调用通知

**用户故事：** 作为用户，我希望在 Telegram 中收到 Agent 工具调用的状态通知，以便了解 Agent 正在执行的操作。

#### 验收标准

1. WHEN Agent 发出 `type: "tool_call"` 事件，THE Gateway SHALL 向当前 Chat 发送一条新消息，内容包含工具名称和参数摘要，格式为 `🔧 调用工具：{toolName}\n参数：{paramsSummary}`
2. WHEN Agent 发出 `type: "tool_result"` 事件，THE Gateway SHALL 更新对应工具调用通知消息，追加执行结果摘要，格式为 `✅ 完成` 或 `❌ 失败：{errorMessage}`
3. THE Gateway SHALL 对工具参数和结果内容进行截断，单条通知消息中参数摘要和结果摘要各不超过 200 个字符，超出部分以 `...` 省略
4. WHERE 工具的 `dangerLevel` 为 `dangerous`，THE Gateway SHALL 在工具调用通知消息中添加 `⚠️` 前缀标识

---

### 需求 5：审批交互

**用户故事：** 作为用户，我希望在 Agent 执行危险操作前收到 Telegram 消息并通过按钮决定是否批准，以便控制 Agent 的危险行为。

#### 验收标准

1. WHEN Agent 发出 `type: "approval_needed"` 事件，THE Gateway SHALL 向当前 Chat 发送一条包含 InlineKeyboard 的审批消息，消息内容包含工具名、危险等级和操作描述，按钮为"✅ 批准"和"❌ 拒绝"
2. WHEN 用户点击"✅ 批准"按钮，THE Gateway SHALL 调用 `onApprovalNeeded` 回调返回 `true`，并将审批消息更新为"已批准 ✅"，移除 InlineKeyboard 按钮
3. WHEN 用户点击"❌ 拒绝"按钮，THE Gateway SHALL 调用 `onApprovalNeeded` 回调返回 `false`，并将审批消息更新为"已拒绝 ❌"，移除 InlineKeyboard 按钮
4. IF 审批消息发出后超过 `config.yaml` 中 `approval.timeout` 配置的秒数（默认 300 秒）仍未收到用户点击，THEN THE Gateway SHALL 根据 `approval.defaultAction` 配置自动执行批准或拒绝，并将审批消息更新为"已超时自动{批准/拒绝} ⏱️"
5. WHEN 同一 Chat 存在多个待审批请求时，THE Gateway SHALL 按发出顺序依次等待用户审批，不并发处理多个审批
6. IF 用户点击的审批按钮对应的请求已超时处理，THEN THE Gateway SHALL 回应 CallbackQuery 并提示"该审批请求已超时"，不重复触发回调

---

### 需求 6：会话管理

**用户故事：** 作为用户，我希望每个 Telegram Chat 拥有独立的对话上下文，以便不同用户或群组的对话互不干扰。

#### 验收标准

1. WHEN Bot 收到来自新 ChatId 的消息，THE Gateway SHALL 为该 ChatId 创建一个新的 Agent 实例和 Session，`sessionId` 格式为 `telegram-{chatId}`
2. WHEN Bot 收到来自已有 ChatId 的消息，THE Gateway SHALL 复用该 ChatId 对应的已有 Agent 实例和 Session
3. THE Gateway SHALL 在内存中维护 ChatId 到 Agent 实例的映射，进程重启后各 ChatId 的历史消息通过 StorageService 自动恢复
4. WHEN 用户发送 `/start` 命令，THE Gateway SHALL 回复欢迎消息，内容包含 Bot 功能简介和可用命令列表
5. WHEN 用户发送 `/new` 命令，THE Gateway SHALL 为当前 ChatId 创建新 Session（生成新的 `sessionId`），清除内存中的历史消息，并回复"已开启新会话"
6. WHEN 用户发送 `/status` 命令，THE Gateway SHALL 回复当前 Agent 的运行状态（`idle` / `running` / `waiting_approval`）和当前 Session ID

---

### 需求 7：错误处理与恢复

**用户故事：** 作为运维人员，我希望 Gateway 在遇到错误时能自动恢复并通知用户，而不是静默失败或进程崩溃。

#### 验收标准

1. WHEN `agent.chat()` 抛出异常，THE Gateway SHALL 向当前 Chat 发送错误提示消息，内容包含错误类型，并将该 Chat 的 Agent 状态重置为 `idle`
2. WHEN StorageService 操作失败，THE Gateway SHALL 通过 pino 记录 error 级别日志，并继续保持当前对话可用（降级为无持久化模式）
3. WHEN Telegram Bot Polling 连接中断，THE Gateway SHALL 依赖 grammy 内置重连机制自动恢复，并通过 pino 记录 warn 级别日志
4. IF grammy 重连失败超过 10 次，THEN THE Gateway SHALL 通过 pino 记录 error 级别日志，并以非零退出码退出进程，由外部进程管理器（pm2 / Docker）负责重启
5. WHEN 未捕获的异常（`uncaughtException`）或未处理的 Promise 拒绝（`unhandledRejection`）发生，THE Gateway SHALL 通过 pino 记录 fatal 级别日志后退出进程

---

### 需求 8：常驻进程与优雅退出

**用户故事：** 作为运维人员，我希望 Gateway 能作为常驻进程稳定运行，并在收到退出信号时优雅关闭，以便保证数据完整性。

#### 验收标准

1. THE Gateway SHALL 监听 `SIGINT` 和 `SIGTERM` 信号，收到信号后执行优雅退出流程
2. WHEN 收到退出信号，THE Gateway SHALL 停止接收新的 Telegram 消息（停止 Polling）
3. WHEN 收到退出信号且存在正在处理中的 Agent 请求，THE Gateway SHALL 等待当前请求完成或超过 30 秒后强制退出
4. WHEN 收到退出信号且存在待审批的请求，THE Gateway SHALL 自动以拒绝处理所有待审批请求，并向对应 Chat 发送"Bot 正在关闭，审批请求已自动拒绝"
5. WHEN 优雅退出流程完成，THE Gateway SHALL 通过 pino 记录 info 级别的关闭日志并以退出码 0 退出进程
