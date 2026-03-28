# Winches Agent — 总体架构设计

> 最后更新：2026-03-28

个人 7×24 小时 Agent 助手，支持本地文件操作、AI 驱动浏览器自动化、Telegram 接入。

## 项目概览

- 项目名：winches-agent
- 包 scope：`@winches/*`
- 语言：TypeScript（strict mode，ESM）
- 架构：pnpm workspaces monorepo，参考 [pi-mono](https://github.com/badlogic/pi-mono)
- 构建工具：tsdown（基于 Rolldown）
- 测试框架：Vitest + fast-check（属性测试）
- 代码规范：ESLint + Prettier
- 日志：pino（JSON 结构化日志）

## Monorepo 包结构

```
winches-agent/
├── packages/
│   ├── ai/          @winches/ai          — 统一 LLM 抽象层
│   ├── core/        @winches/core        — 工具注册表 + 内置工具
│   ├── storage/     @winches/storage     — 持久化层（SQLite + 向量搜索）
│   ├── agent/       @winches/agent       — Agent 运行时（嵌入式库）
│   ├── tui/         @winches/tui         — 终端聊天界面
│   ├── web-ui/      @winches/web-ui      — 管理/调试 Web 面板
│   └── gateway/     @winches/gateway     — Telegram 接入
├── config.yaml                           — 项目配置文件
├── package.json                          — workspace 根配置
├── tsconfig.json                         — 共享 TS 配置
└── Dockerfile
```

### 包依赖关系

```
ai（无依赖；provider SDK 为 optional peerDependencies）
storage（依赖 ai，用于 embedding 生成）
core（依赖 ai，工具定义格式对齐 LLM tool calling）
agent（依赖 ai、core、storage）
tui（依赖 agent、ai、core、storage）
gateway（依赖 agent、ai、core、storage）
web-ui（依赖 storage，直接读数据库）
```

> **实现说明**：TUI 和 Gateway 直接依赖 ai、core、storage 是因为宿主程序负责初始化所有服务实例（AIClient、StorageService、ToolRegistry）并注入给 Agent。这是嵌入式库模式的自然结果。

## 1. AI 包 — 统一 LLM 抽象层

`@winches/ai` 是最底层的包，提供统一的多 provider LLM 调用接口。

### 核心接口

```typescript
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  toolCallId?: string; // tool 角色消息关联的 tool_call_id
  toolCalls?: ToolCall[]; // assistant 角色消息携带的工具调用列表
}

interface LLMProvider {
  readonly name: string;
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
}

interface ChatOptions {
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}
```

### 支持的 Provider

- OpenAI（GPT-4o / GPT-5 等）— 通过 `openai` SDK（optional peerDependency）
- Anthropic（Claude 系列）— 通过 `@anthropic-ai/sdk`（optional peerDependency）
- Google（Gemini 系列）— 通过 `@google/generative-ai`（optional peerDependency）
- OpenAI 兼容接口（DeepSeek、Ollama 等）— 复用 `openai` SDK，自定义 baseUrl

### 已实现的辅助模块

- `AIClient` / `createAIClient` / `createAIClientFromConfig`：统一客户端工厂
- `ProviderRegistry`：Provider 工厂注册表，支持运行时注册自定义 provider
- `ConfigLoader`：从 config.yaml 加载 LLM 配置
- `RetryHandler`：自动重试（指数退避），可配置重试次数和策略

### 设计要点

- 流式输出是一等公民，`chatStream` 返回 `AsyncIterable`
- Tool calling 格式差异在 provider 内部抹平，对外统一
- Provider 通过配置文件选择，运行时可切换
- 不含 embedding 接口（放在 storage 包，与向量存储紧耦合）

## 2. Core 包 — 工具注册表与内置工具

`@winches/core` 提供工具注册表和所有内置工具。

### 核心接口

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  dangerLevel: "safe" | "confirm" | "dangerous";
  execute(params: unknown): Promise<ToolResult>;
}

interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  listByDangerLevel(level: string): Tool[];
}
```

### 内置工具清单

#### 文件操作

| 工具          | 说明         | 权限      |
| ------------- | ------------ | --------- |
| `file.read`   | 读取文件内容 | safe      |
| `file.write`  | 写入文件     | confirm   |
| `file.delete` | 删除文件     | dangerous |
| `file.list`   | 列出目录     | safe      |
| `file.move`   | 移动/重命名  | confirm   |

#### 浏览器控制（基于 Playwright）

| 工具                 | 说明                 | 权限    |
| -------------------- | -------------------- | ------- |
| `browser.open`       | 打开 URL             | safe    |
| `browser.screenshot` | 截图当前页面         | safe    |
| `browser.click`      | 点击元素             | confirm |
| `browser.type`       | 输入文本             | confirm |
| `browser.evaluate`   | 执行 JS 获取页面信息 | confirm |
| `browser.navigate`   | AI 驱动自主浏览      | confirm |

#### Shell 执行

| 工具         | 说明            | 权限      |
| ------------ | --------------- | --------- |
| `shell.exec` | 执行 shell 命令 | dangerous |

#### 网络请求

| 工具        | 说明           | 权限    |
| ----------- | -------------- | ------- |
| `http.get`  | HTTP GET 请求  | safe    |
| `http.post` | HTTP POST 请求 | confirm |

#### 系统信息

| 工具               | 说明                   | 权限 |
| ------------------ | ---------------------- | ---- |
| `system.info`      | 获取 CPU/内存/磁盘状态 | safe |
| `system.processes` | 查看运行中进程         | safe |

#### 剪贴板

| 工具              | 说明           | 权限    |
| ----------------- | -------------- | ------- |
| `clipboard.read`  | 读取系统剪贴板 | safe    |
| `clipboard.write` | 写入系统剪贴板 | confirm |

#### 定时任务

| 工具               | 说明              | 权限    |
| ------------------ | ----------------- | ------- |
| `scheduler.set`    | 设置定时提醒/执行 | confirm |
| `scheduler.list`   | 列出定时任务      | safe    |
| `scheduler.cancel` | 取消定时任务      | safe    |

### 实现状态

| 工具类别                 | 状态      | 说明                                       |
| ------------------------ | --------- | ------------------------------------------ |
| 文件操作（file.\*）      | ✅ 已实现  | 5 个工具全部可用                           |
| Shell 执行（shell.exec） | ✅ 已实现  | 带超时和输出截断                           |
| 浏览器控制（browser.\*） | 🔲 Phase 4 | 已注册定义，execute 返回 "Not implemented" |
| 网络请求（http.\*）      | 🔲 Phase 4 | 同上                                       |
| 系统信息（system.\*）    | 🔲 Phase 4 | 同上                                       |
| 剪贴板（clipboard.\*）   | 🔲 Phase 4 | 同上                                       |
| 定时任务（scheduler.\*） | 🔲 Phase 4 | 同上                                       |

> **注意**：Phase 4 工具的定义文件已存在于 `packages/core/src/tools/` 下，但未在 `createDefaultRegistry()` 中注册。宿主程序可按需手动注册。

### 记忆工具（宿主注册）

TUI 在启动时额外注册了两个记忆工具（依赖 StorageService 实例）：

| 工具              | 说明               | 权限 |
| ----------------- | ------------------ | ---- |
| `memory-remember` | 保存信息到长期记忆 | safe |
| `memory-recall`   | 语义搜索长期记忆   | safe |

> TUI 和 Gateway 均已注册这两个工具。

> **TODO**：这两个工具应统一到 `@winches/core` 或提供工厂函数，避免 TUI 和 Gateway 重复注册代码。

- `safe`：直接执行，无需确认
- `confirm`：通过当前通道发送确认消息，用户批准后执行
- `dangerous`：需要明确批准，支持超时自动拒绝

## 3. Storage 包 — 持久化与长期记忆

`@winches/storage` 提供所有数据持久化能力。

### 技术选型

- SQLite：`better-sqlite3`
- 向量搜索：`sqlite-vec` 扩展
- Schema 迁移：版本号 + SQL 脚本（不引入重型 ORM）

### 核心接口

```typescript
interface StorageService {
  // 对话历史
  saveMessage(sessionId: string, message: Message): Promise<void>;
  getHistory(sessionId: string, limit?: number): Promise<Message[]>;
  searchHistory(query: string, topK?: number): Promise<Message[]>;
  listSessions(limit?: number): Promise<SessionInfo[]>;

  // 长期记忆（语义搜索 + 重要性 + 时间衰减）
  remember(content: string, tags?: string[], options?: RememberOptions): Promise<Memory>;
  recall(query: string, topK?: number, options?: RecallOptions): Promise<Memory[]>;
  forget(strategy: ForgetStrategy): Promise<number>;

  // 工作记忆（会话级，带 TTL 和容量限制）
  rememberWorking(
    content: string,
    sessionId: string,
    options?: WorkingMemoryOptions,
  ): Promise<WorkingMemory>;
  recallWorking(sessionId: string): Promise<WorkingMemory[]>;

  // 情景记忆（对话历史的语义搜索）
  searchEpisodic(query: string, options?: EpisodicSearchOptions): Promise<EpisodicMemory[]>;

  // 记忆摘要
  memorySummary(): Promise<MemorySummary>;

  // 定时任务持久化
  saveScheduledTask(task: ScheduledTask): Promise<void>;
  getPendingTasks(): Promise<ScheduledTask[]>;
  updateTaskStatus(id: string, status: "completed" | "cancelled"): Promise<void>;

  // 审计日志
  logToolExecution(
    toolName: string,
    input: unknown,
    output: unknown,
    durationMs: number,
    sessionId?: string,
  ): Promise<void>;
  getToolExecutionLogs(filter?: {
    sessionId?: string;
    toolName?: string;
    limit?: number;
  }): Promise<ToolExecutionLog[]>;

  // 审批队列
  queueApproval(request: ApprovalRequest): Promise<string>;
  getApproval(id: string): Promise<ApprovalStatus>;
  updateApprovalStatus(id: string, status: Exclude<ApprovalStatus, "pending">): Promise<void>;
}
```

### 三层记忆架构

Storage 包实现了三层记忆系统：

| 层级     | 类型             | 生命周期                       | 检索方式                           |
| -------- | ---------------- | ------------------------------ | ---------------------------------- |
| 长期记忆 | `Memory`         | 永久（可通过 forget 策略清理） | 向量相似度 × 时间衰减 × 重要性权重 |
| 工作记忆 | `WorkingMemory`  | 会话级，带 TTL（默认 1h）      | 按会话 ID 查询，自动过期           |
| 情景记忆 | `EpisodicMemory` | 随对话历史永久保存             | 对话消息的向量语义搜索             |

#### 长期记忆检索公式

```
composite_score = similarity × exp(-λ × age_days) × (1 + w × importance)
```

- `λ`（decayRate）：时间衰减率，默认 0.1
- `w`（importanceWeight）：重要性权重，默认 0.3
- `importance`：[0, 1] 范围，默认 0.5

#### 遗忘策略

```typescript
type ForgetStrategy =
  | { type: "importance"; threshold: number } // 删除 importance < threshold 的记忆
  | { type: "time"; olderThanMs: number } // 删除超过指定时间的记忆
  | { type: "capacity"; maxCount: number }; // 保留 retention_score 最高的 N 条
```

### 存储内容

- 对话历史：按 session 存储，支持关键词搜索和向量语义搜索（情景记忆）
- 长期记忆：Agent 主动记住的重要信息，带标签、时间戳、重要性评分和向量
- 工作记忆：会话级短期记忆，带 TTL 自动过期和容量限制（默认每会话 50 条）
- 定时任务：持久化存储，重启后自动恢复
- 工具执行历史：审计日志，记录每次工具调用的输入、输出、耗时
- 审批队列：待确认的危险操作，支持状态流转

### Embedding 生成

- 默认使用本地模型 `Xenova/all-MiniLM-L6-v2`（通过 `@huggingface/transformers`）
- 可通过 config.yaml 切换到云端 embedding API
- 对话消息的 embedding 异步生成，不阻塞消息保存

## 4. Agent 包 — 运行时核心（嵌入式库）

`@winches/agent` 是系统的大脑，作为嵌入式库被 TUI 和 Gateway 直接 import 使用。

### 架构模式

嵌入式库模式（参考 pi-mono 的 agent-core）：

- 不是独立服务进程，没有 HTTP server
- TUI 和 Gateway 各自创建自己的 Agent 实例
- 各实例有独立的对话历史，不共享状态
- 权限审批通过回调函数实现，由宿主程序驱动 UI 交互

### 核心接口

```typescript
interface AgentConfig {
  provider: LLMProvider;
  storage: StorageService;
  registry: ToolRegistry;
  sessionId: string;
  systemPrompt?: string; // 可选，未传时由 buildSystemPrompt() 动态生成
  maxIterations?: number; // 工具调用循环上限，默认 10
  skillRegistry?: ISkillRegistry;
  mcpClientManager?: IMcpClientManager;
}

class Agent {
  constructor(config: AgentConfig);

  // 核心对话，流式返回事件
  chat(messages: Message[]): AsyncIterable<AgentEvent>;

  // 审批回调（由宿主程序实现，未注册时自动拒绝所有需审批操作）
  onApprovalNeeded: ((request: ApprovalRequest) => Promise<boolean>) | undefined;

  // 状态查询
  getStatus(): AgentStatus;
}

type AgentStatus = "idle" | "running" | "waiting_approval";

type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; tool: string; params: unknown }
  | { type: "tool_result"; result: ToolResult }
  | { type: "approval_needed"; request: ApprovalRequest }
  | { type: "done" };
```

### System Prompt 构建

Agent 不再使用硬编码的默认 system prompt。当 `AgentConfig.systemPrompt` 未传入时，构造函数调用 `buildSystemPrompt(params)` 动态组装。

#### `buildSystemPrompt` 参数

```typescript
interface SystemPromptParams {
  registry: IToolRegistry;        // 工具注册表，用于生成工具列表
  skillRegistry?: ISkillRegistry; // Skill 注册表（可选）
  cwd?: string;                   // 工作目录（默认 process.cwd()）
  homeDir?: string;               // 用户主目录（默认 os.homedir()）
  workspaceGuidance?: string;     // 工作区引导说明
  workspaceNotes?: string;        // 工作区备注
  agentsMd?: string;              // AGENTS.md 内容
  readToolName?: string;          // Skills 区块中引用的读取工具名（默认 "file-read"）
  skillsPrompt?: string;          // Skills 原始 prompt
}
```

#### 组装顺序

System prompt 由以下区块按顺序拼接：

| 序号 | 区块                 | 条件               | 内容                                                              |
| ---- | -------------------- | ------------------ | ----------------------------------------------------------------- |
| 1    | Identity             | 始终               | 身份声明、用户主目录                                              |
| 2    | `## Tooling`         | 有工具时           | 按 dangerLevel 分组列出所有注册工具（safe → confirm → dangerous） |
| 3    | `## Tool Call Style` | 始终               | 工具调用行为规范（先解释再调用、失败不重试、禁止长时进程等）      |
| 4    | `## Skills`          | 有 skillsPrompt 时 | Skill 选择协议 + `<available_skills>` 列表                        |
| 5    | `## Workspace`       | 始终               | 工作目录路径，可选的 guidance 和 notes                            |
| 6    | `## Agents.md`       | 有内容时           | 项目级指导文档原文                                                |

> **Tooling 区块**：工具名称通过 `sanitizeToolName()` 转换为 LLM 兼容格式（`file.read` → `file-read`），并附带 description。按权限级别分组展示，让 LLM 了解哪些工具可直接执行、哪些需要审批。

> **宿主程序自定义**：宿主程序可传入自定义 `systemPrompt` 字符串完全覆盖默认行为，也可调用 `buildSystemPrompt()` 并传入 `workspaceGuidance`、`agentsMd` 等参数进行定制。

### 已实现的模块

- `agent.ts`：Agent 类，管理状态和生命周期，构造时调用 `buildSystemPrompt()` 生成默认 prompt
- `loop.ts`：对话循环实现（conversationLoop），含 Slash Command 拦截和 Skill 注入
- `dispatch.ts`：工具调度和权限检查
- `prompt.ts`：`buildSystemPrompt()`（结构化 system prompt 组装）+ `buildMessages()`（system + 记忆 + 历史 + 当前消息拼接）
- `stream.ts`：流式响应解析（aggregateStream）
- `slash-commands.ts`：Slash Command 处理和补全（/skills、/mcp-status、Skill 调用）

### 对话循环

```
用户消息
→ Slash Command 检测（/ 开头时尝试匹配 skill 或内置命令）
→ 保存用户消息到 storage
→ 检索相关记忆（storage.recall）
→ buildMessages(systemPrompt, memories, history, currentMessages)
→ 调用 LLM（ai.chatStream + registryToToolDefinitions）
→ 解析响应
  → 文本回复 → yield text event → 保存 → 自动记忆用户消息
  → 工具调用 → 检查 dangerLevel
    → safe → 直接执行
    → confirm/dangerous → 调用 onApprovalNeeded 回调
      → approved → 执行
      → rejected → 告知 LLM 操作被拒绝
    → 将工具结果喂回 LLM → 继续循环（最多 maxIterations 轮）
  → 连续工具调用全部失败 ≥ 2 次 → 提前中断
```

## 5. TUI 包 — 终端聊天界面

`@winches/tui` 是日常和 Agent 对话的主入口。

### 技术选型

- 渲染框架：ink（React 风格的终端 UI）+ React 18
- 直接嵌入 `@winches/agent` 实例
- 开发运行：`tsx src/index.ts`（无需预编译）

### 启动流程

TUI 的 `index.ts` 负责完整的 bootstrap：

1. 加载 `.env` 文件（向上查找最多 6 层）
2. 加载 `config.yaml` 配置
3. 创建 AIClient（LLMProvider）
4. 初始化 StorageService（SQLite + 迁移 + EmbeddingService）
5. 创建 ToolRegistry 并注册额外的 memory 工具
6. 实例化 Agent 并渲染 ink App 组件

> **降级模式**：如果 StorageService 初始化失败，TUI 会以无持久化模式运行（使用 NullStorage）。

### 核心功能

- 聊天界面：输入消息，流式显示 Agent 回复（逐 token 渲染）
- 工具调用可视化：显示工具名、参数、执行状态
- 审批交互：危险操作时在终端内弹出确认提示（Y/N）
- Markdown 渲染：代码块、列表等基本格式化
- 会话管理：新建（/new）、切换（/switch）、列出历史会话（/sessions）、帮助（/help）

### 审批实现

TUI 实现 `onApprovalNeeded` 回调：在终端显示操作描述，等待用户输入 Y/N。

## 6. Gateway 包 — Telegram 接入

`@winches/gateway` 提供 Telegram Bot 接入，作为常驻进程 7×24 在线。

### 技术选型

- Telegram Bot 框架：grammy（TypeScript 原生，维护活跃）
- 直接嵌入 `@winches/agent` 实例
- 日志：pino

### 启动流程

Gateway 的 `index.ts` 与 TUI 共享类似的 bootstrap 逻辑：

1. 加载 `.env` 和 `config.yaml`
2. 创建 AIClient、StorageService、ToolRegistry
3. 实例化 `GatewayBot` 并启动

> **降级模式**：同 TUI，StorageService 初始化失败时以无持久化模式运行。
>
> **TODO**：TUI 和 Gateway 的 bootstrap 代码高度重复（findFile、loadDotEnv、createNullStorage、migration 路径查找），应提取到共享模块。

### 已实现功能

- 命令处理：/start（帮助）、/new（新会话）、/status（查看状态）
- 消息处理：流式收集 Agent 回复，ThrottledBuffer 定时 editMessageText
- 工具调用通知：发送独立消息显示工具名、参数、完成/失败状态
- 审批交互：InlineKeyboard 按钮 + 超时自动拒绝
- 会话管理：SessionManager，per-chatId 独立 Agent 实例
- Memory 工具：memory-remember / memory-recall（与 TUI 一致）
- 优雅关闭：清理 pending approvals，等待活跃请求完成

### 消息处理流程

```
Telegram 消息 → grammy 接收 → 转成 Message 格式 → agent.chat()
→ 流式收集回复 → 定时 editMessageText 更新显示
→ 工具调用时发送通知消息
→ 需要审批时发送 inline keyboard（Approve / Reject 按钮）
→ 用户点击按钮 → 回调触发 approve/reject
```

### 审批实现

Gateway 实现 `onApprovalNeeded` 回调：

- 发送 Telegram 消息，附带操作描述和 inline keyboard 按钮
- 用户点 Approve → 返回 true，点 Reject → 返回 false
- 支持超时自动拒绝（可配置，默认 5 分钟）

### 部署

- 常驻进程运行（pm2 / Docker）
- grammy 内置 Telegram 连接断开自动重连

## 7. WebUI 包 — 管理/调试面板

`@winches/web-ui` 提供 Web 管理面板，用于查看状态和调试。

### 技术选型

- 前端：React SPA
- 后端：极简本地 API server（Hono）
- 数据源：直接读 `@winches/storage` 的 SQLite 数据库

### 核心功能

- 对话历史浏览：按会话查看完整对话记录
- 工具执行日志：查看每次工具调用的参数、结果、耗时
- 定时任务管理：查看/取消定时任务
- 记忆管理：浏览长期记忆条目，手动添加/删除
- 配置管理：查看和修改 Agent 配置
- 系统状态：存储用量、最近活动概览

## 8. 配置管理

### 配置文件

项目根目录 `config.yaml`：

```yaml
llm:
  provider: openai # openai | anthropic | google | openai-compatible
  model: gpt-5.4
  apiKey: ${AGENT_API_KEY} # 支持环境变量引用
  baseUrl: null # openai-compatible 时使用

embedding:
  provider: local # local | openai
  model: Xenova/all-MiniLM-L6-v2 # 本地模型，无需 API key

telegram:
  botToken: ${AGENT_TELEGRAM_TOKEN}

approval:
  timeout: 300 # 审批超时秒数，默认 5 分钟
  defaultAction: reject # 超时后默认拒绝

storage:
  dbPath: ./data/agent.db

logging:
  level: info # debug | info | warn | error
```

### 环境变量覆盖

所有配置项支持 `AGENT_*` 前缀的环境变量覆盖：

- `AGENT_LLM_PROVIDER`
- `AGENT_LLM_MODEL`
- `AGENT_API_KEY`
- `AGENT_TELEGRAM_TOKEN`

## 9. 错误处理

| 场景              | 策略                                          |
| ----------------- | --------------------------------------------- |
| LLM 调用失败      | 自动重试 3 次，指数退避，最终通知用户         |
| 工具执行失败      | 捕获错误，将错误信息作为 tool result 返回 LLM |
| Telegram 连接断开 | grammy 内置自动重连                           |
| 浏览器崩溃        | Playwright 进程隔离，崩溃后自动重启新实例     |
| 审批超时          | 默认拒绝，通知 LLM 操作被拒绝                 |

## 10. 部署

### 本地运行

```bash
pnpm start:tui       # TUI 聊天模式（tsx 直接运行）
pnpm start:gateway   # Telegram Bot 模式（需先 build）
pnpm start:web-ui    # 管理面板（未实现）
```

### Docker

提供 Dockerfile 和 docker-compose.yaml：

- gateway 容器：Telegram Bot 常驻运行
- web-ui 容器：管理面板
- 共享 volume 挂载 SQLite 数据文件和配置

## 11. 子项目拆分与实施顺序

由于整体项目较大，建议按以下顺序拆分为独立子项目，每个子项目走独立的 spec → plan → implementation 周期：

### Phase 1：基础层 ✅

1. **Monorepo 脚手架** — pnpm workspaces、tsdown 构建、ESLint + Prettier、共享 tsconfig ✅
2. **@winches/ai** — 统一 LLM 抽象层，4 个 provider 全部实现（OpenAI、Anthropic、Google、OpenAI-compatible），含 RetryHandler ✅
3. **@winches/storage** — SQLite + sqlite-vec + 三层记忆架构（长期/工作/情景）+ 遗忘机制 ✅

### Phase 2：核心能力 ✅

4. **@winches/core** — 工具注册表 + 文件操作工具 + shell 工具（Phase 4 工具已定义但未注册） ✅
5. **@winches/agent** — Agent 运行时，对话循环 + 工具调度 + 权限审批 + 流式事件 ✅

### Phase 3：用户界面 ✅

6. **@winches/tui** — 终端聊天界面，ink + React，流式渲染、工具可视化、审批交互、会话管理（/new /switch /sessions /help）✅
7. **@winches/gateway** — Telegram Bot 接入，grammy 长轮询、流式 editMessageText、InlineKeyboard 审批、memory 工具注册 ✅

### Phase 4：扩展 🔲 未开始

8. **@winches/core 扩展** — 浏览器控制、网络请求、系统信息、剪贴板、定时任务工具（定义文件已存在，需实现 execute）
9. **@winches/web-ui** — 管理/调试面板（包已创建，src/index.ts 为空）

每个 phase 完成后都有可运行的产物，Phase 2 结束后就能通过代码调用 Agent，Phase 3 结束后就有完整的用户交互体验。

## 12. 已知偏差与 TODO

| 项目                | 说明                                                                                                                                 | 优先级        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Bootstrap 代码重复  | TUI 和 Gateway 的 `index.ts` 有大量重复的初始化逻辑（findFile、loadDotEnv、createNullStorage、migration 路径查找），应提取到共享模块 | 高            |
| shell.exec 权限级别 | 设计文档定义为 `dangerous`，实际实现为 `safe`（方便开发阶段使用），上线前需改回                                                      | 中            |
| Phase 4 工具 stub   | 15 个工具有定义文件但未实现 execute，也未在 createDefaultRegistry 中注册                                                             | 低（按计划）  |
| web-ui 空包         | `@winches/web-ui` 仅有空的 index.ts                                                                                                  | 低（Phase 4） |
