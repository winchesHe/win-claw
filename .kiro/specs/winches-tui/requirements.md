# 需求文档

## 简介

`@winches/tui` 是 winches-agent 项目的终端聊天界面，是用户与 Agent 日常交互的主入口。
基于 ink（React 风格终端 UI 框架）实现，直接嵌入 `@winches/agent` 实例，提供流式对话、工具调用可视化、危险操作审批、Markdown 渲染和会话管理等核心功能。

## 词汇表

- **TUI**：Terminal User Interface，终端用户界面，即本包 `@winches/tui`
- **Agent**：`@winches/agent` 包导出的 `Agent` 类实例，负责对话循环与工具调度
- **AgentEvent**：Agent 流式输出的事件，类型为 `text | tool_call | tool_result | approval_needed | done`
- **ApprovalRequest**：需要用户审批的工具调用请求，包含工具名、参数和危险等级
- **Session**：一次独立的对话上下文，由 `sessionId` 标识，存储于 `@winches/storage`
- **StorageService**：`@winches/storage` 提供的持久化服务接口
- **DangerLevel**：工具危险等级，分为 `safe`、`confirm`、`dangerous`
- **MessageBubble**：聊天界面中单条消息的渲染单元
- **ToolCallCard**：工具调用可视化组件，显示工具名、参数和执行状态
- **ApprovalPrompt**：审批交互组件，在终端内显示确认提示
- **InputBox**：用户输入区域组件

---

## 需求

### 需求 1：启动与初始化

**用户故事：** 作为开发者，我希望通过命令行启动 TUI，自动完成 Agent 初始化，以便立即开始对话。

#### 验收标准

1. WHEN 用户执行 `npm run start:tui`，THE TUI SHALL 读取项目根目录的 `config.yaml` 完成 Agent 初始化并渲染聊天界面
2. WHEN `config.yaml` 中的必填字段（`llm.provider`、`llm.apiKey`）缺失，THE TUI SHALL 在终端输出明确的错误信息并以非零退出码退出
3. WHEN 环境变量 `AGENT_API_KEY` 存在，THE TUI SHALL 优先使用环境变量值覆盖 `config.yaml` 中的对应字段
4. WHEN TUI 启动成功，THE TUI SHALL 自动加载或创建一个默认 Session 并显示欢迎信息

---

### 需求 2：聊天消息输入

**用户故事：** 作为用户，我希望在终端底部输入消息并发送，以便与 Agent 进行对话。

#### 验收标准

1. THE InputBox SHALL 始终固定显示在终端底部，不随消息列表滚动
2. WHEN 用户在 InputBox 中按下 Enter 键且输入内容非空，THE TUI SHALL 将消息发送给 Agent 并清空 InputBox
3. WHEN 用户在 InputBox 中按下 Enter 键且输入内容为空，THE TUI SHALL 忽略该操作，不发送任何消息
4. WHILE Agent 正在处理消息（状态为 `running` 或 `waiting_approval`），THE InputBox SHALL 禁用输入并显示等待状态提示
5. WHEN 用户按下 Ctrl+C，THE TUI SHALL 优雅退出，确保当前 Session 数据已持久化

---

### 需求 3：流式消息显示

**用户故事：** 作为用户，我希望 Agent 的回复以流式方式逐 token 渲染，以便实时看到生成进度。

#### 验收标准

1. WHEN Agent 发出 `type: "text"` 事件，THE TUI SHALL 将 `content` 字段追加到当前 MessageBubble 并立即重新渲染
2. WHEN Agent 发出 `type: "done"` 事件，THE TUI SHALL 将当前 MessageBubble 标记为完成状态并恢复 InputBox 可用
3. THE TUI SHALL 在消息列表区域保持自动滚动，使最新内容始终可见
4. WHEN 消息列表超出终端可视高度，THE TUI SHALL 仅渲染最近的消息，避免终端缓冲区溢出

---

### 需求 4：工具调用可视化

**用户故事：** 作为用户，我希望在聊天界面中看到 Agent 正在调用哪些工具及其执行状态，以便了解 Agent 的行为。

#### 验收标准

1. WHEN Agent 发出 `type: "tool_call"` 事件，THE TUI SHALL 在消息流中插入一个 ToolCallCard，显示工具名称和参数摘要，状态标记为"执行中"
2. WHEN Agent 发出 `type: "tool_result"` 事件，THE TUI SHALL 更新对应 ToolCallCard 的状态为"完成"或"失败"，并显示结果摘要
3. THE ToolCallCard SHALL 对参数和结果内容进行截断，单个 ToolCallCard 显示的文本不超过 200 个字符，超出部分以 `...` 省略
4. WHERE 工具的 `dangerLevel` 为 `dangerous`，THE ToolCallCard SHALL 使用红色高亮显示工具名称

---

### 需求 5：危险操作审批交互

**用户故事：** 作为用户，我希望在 Agent 执行危险操作前收到终端内的确认提示，以便决定是否允许执行。

#### 验收标准

1. WHEN Agent 发出 `type: "approval_needed"` 事件，THE TUI SHALL 暂停输入并渲染 ApprovalPrompt，显示工具名、危险等级和操作描述
2. WHEN ApprovalPrompt 显示时，THE TUI SHALL 等待用户输入 `y`/`Y`（批准）或 `n`/`N`（拒绝），其他按键输入忽略
3. WHEN 用户输入 `y` 或 `Y`，THE TUI SHALL 调用 `onApprovalNeeded` 回调返回 `true`，并关闭 ApprovalPrompt
4. WHEN 用户输入 `n` 或 `N`，THE TUI SHALL 调用 `onApprovalNeeded` 回调返回 `false`，并关闭 ApprovalPrompt
5. IF 审批等待超过 300 秒（可通过 `config.yaml` 的 `approval.timeout` 配置），THEN THE TUI SHALL 自动返回 `false` 并在界面显示超时提示

---

### 需求 6：Markdown 渲染

**用户故事：** 作为用户，我希望 Agent 回复中的 Markdown 格式（代码块、列表、粗体等）在终端中正确渲染，以便阅读结构化内容。

#### 验收标准

1. WHEN MessageBubble 内容包含围栏代码块（` ``` `），THE TUI SHALL 以终端支持的高亮样式渲染代码块，并显示语言标识
2. WHEN MessageBubble 内容包含无序列表（`-` 或 `*` 开头），THE TUI SHALL 渲染为带缩进的列表项
3. WHEN MessageBubble 内容包含有序列表（数字 + `.` 开头），THE TUI SHALL 渲染为带编号的列表项
4. WHEN MessageBubble 内容包含粗体（`**text**`），THE TUI SHALL 以终端粗体样式渲染
5. WHEN MessageBubble 内容包含行内代码（`` `code` ``），THE TUI SHALL 以不同背景色或样式区分行内代码
6. WHILE Agent 正在流式输出（MessageBubble 未完成），THE TUI SHALL 对已接收内容进行增量 Markdown 渲染，不等待完整消息

---

### 需求 7：会话管理

**用户故事：** 作为用户，我希望能够新建、切换和列出历史会话，以便管理多个独立的对话上下文。

#### 验收标准

1. WHEN 用户输入 `/new` 命令，THE TUI SHALL 创建一个新 Session（生成新的 `sessionId`）并切换到该 Session，清空当前消息列表
2. WHEN 用户输入 `/sessions` 命令，THE TUI SHALL 通过 StorageService 查询历史 Session 列表，并在界面中显示 Session ID 和最后一条消息的时间戳
3. WHEN 用户输入 `/switch <sessionId>` 命令，THE TUI SHALL 切换到指定 Session，并从 StorageService 加载该 Session 的历史消息显示在界面中
4. IF 用户输入 `/switch <sessionId>` 时指定的 `sessionId` 不存在，THEN THE TUI SHALL 显示错误提示"会话不存在"，保持当前 Session 不变
5. WHEN 用户输入 `/help` 命令，THE TUI SHALL 显示所有可用命令的说明列表

---

### 需求 8：错误处理与恢复

**用户故事：** 作为用户，我希望 TUI 在遇到错误时给出清晰提示并保持可用，而不是直接崩溃。

#### 验收标准

1. WHEN Agent 的 `chat()` 方法抛出异常，THE TUI SHALL 在消息列表中显示错误提示，并将 InputBox 恢复为可用状态
2. WHEN StorageService 操作失败，THE TUI SHALL 在界面显示警告信息，并继续保持当前对话可用（降级为无持久化模式）
3. IF Agent 状态为 `running` 时用户按下 Ctrl+C，THEN THE TUI SHALL 显示确认提示"Agent 正在运行，确认退出？(y/n)"，用户确认后再退出
4. WHEN 终端窗口尺寸发生变化，THE TUI SHALL 自动重新布局，确保 InputBox 和消息列表正确适配新尺寸
