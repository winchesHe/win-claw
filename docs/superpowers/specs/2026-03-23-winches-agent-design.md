# Winches Agent — 总体架构设计

个人 7×24 小时 Agent 助手，支持本地文件操作、AI 驱动浏览器自动化、Telegram 接入。

## 项目概览

- 项目名：winches-agent
- 包 scope：`@winches/*`
- 语言：TypeScript（strict mode，ESM）
- 架构：npm workspaces monorepo，参考 [pi-mono](https://github.com/badlogic/pi-mono)
- 构建工具：tsdown（基于 Rolldown）
- 测试框架：Vitest
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
ai（无依赖）
storage（依赖 ai，用于 embedding 生成）
core（依赖 ai，工具定义格式对齐 LLM tool calling）
agent（依赖 ai、core、storage）
tui（依赖 agent）
gateway（依赖 agent）
web-ui（依赖 storage，直接读数据库）
```

## 1. AI 包 — 统一 LLM 抽象层

`@winches/ai` 是最底层的包，提供统一的多 provider LLM 调用接口。

### 核心接口

```typescript
interface Message {
  role: "system" | "user" | "assistant" | "tool"
  content: string | ContentPart[]
}

interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>
}

interface ChatOptions {
  tools?: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  model?: string
}
```

### 支持的 Provider

- OpenAI（GPT-4o 等）
- Anthropic（Claude 系列）
- Google（Gemini 系列）
- OpenAI 兼容接口（DeepSeek、Ollama 等）

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
  name: string
  description: string
  parameters: JSONSchema
  dangerLevel: "safe" | "confirm" | "dangerous"
  execute(params: unknown): Promise<ToolResult>
}

interface ToolRegistry {
  register(tool: Tool): void
  get(name: string): Tool | undefined
  list(): Tool[]
  listByDangerLevel(level: string): Tool[]
}
```

### 内置工具清单

#### 文件操作
| 工具 | 说明 | 权限 |
|------|------|------|
| `file.read` | 读取文件内容 | safe |
| `file.write` | 写入文件 | confirm |
| `file.delete` | 删除文件 | dangerous |
| `file.list` | 列出目录 | safe |
| `file.move` | 移动/重命名 | confirm |

#### 浏览器控制（基于 Playwright）
| 工具 | 说明 | 权限 |
|------|------|------|
| `browser.open` | 打开 URL | safe |
| `browser.screenshot` | 截图当前页面 | safe |
| `browser.click` | 点击元素 | confirm |
| `browser.type` | 输入文本 | confirm |
| `browser.evaluate` | 执行 JS 获取页面信息 | confirm |
| `browser.navigate` | AI 驱动自主浏览 | confirm |

#### Shell 执行
| 工具 | 说明 | 权限 |
|------|------|------|
| `shell.exec` | 执行 shell 命令 | dangerous |

#### 网络请求
| 工具 | 说明 | 权限 |
|------|------|------|
| `http.get` | HTTP GET 请求 | safe |
| `http.post` | HTTP POST 请求 | confirm |

#### 系统信息
| 工具 | 说明 | 权限 |
|------|------|------|
| `system.info` | 获取 CPU/内存/磁盘状态 | safe |
| `system.processes` | 查看运行中进程 | safe |

#### 剪贴板
| 工具 | 说明 | 权限 |
|------|------|------|
| `clipboard.read` | 读取系统剪贴板 | safe |
| `clipboard.write` | 写入系统剪贴板 | confirm |

#### 定时任务
| 工具 | 说明 | 权限 |
|------|------|------|
| `scheduler.set` | 设置定时提醒/执行 | confirm |
| `scheduler.list` | 列出定时任务 | safe |
| `scheduler.cancel` | 取消定时任务 | safe |

### 权限分级

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
  saveMessage(sessionId: string, message: Message): Promise<void>
  getHistory(sessionId: string, limit?: number): Promise<Message[]>
  searchHistory(query: string, topK?: number): Promise<Message[]>

  // 长期记忆（语义搜索）
  remember(content: string, tags?: string[]): Promise<void>
  recall(query: string, topK?: number): Promise<Memory[]>

  // 定时任务持久化
  saveScheduledTask(task: ScheduledTask): Promise<void>
  getPendingTasks(): Promise<ScheduledTask[]>

  // 审批队列
  queueApproval(request: ApprovalRequest): Promise<string>
  getApproval(id: string): Promise<ApprovalStatus>
}
```

### 存储内容

- 对话历史：按 session 存储，支持关键词和语义搜索
- 长期记忆：Agent 主动记住的重要信息（用户偏好、常用路径等），带标签和时间戳
- 定时任务：持久化存储，重启后自动恢复
- 工具执行历史：审计日志
- 审批队列：待确认的危险操作

### Embedding 生成

- 默认通过 `@winches/ai` 调用云端 embedding API
- 可配置切换到本地模型


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
class Agent {
  constructor(config: AgentConfig)

  // 核心对话，流式返回事件
  chat(messages: Message[]): AsyncIterable<AgentEvent>

  // 审批回调（由宿主程序实现）
  onApprovalNeeded: (request: ApprovalRequest) => Promise<boolean>

  // 状态查询
  getStatus(): AgentStatus
}

type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; tool: string; params: unknown }
  | { type: "tool_result"; result: ToolResult }
  | { type: "approval_needed"; request: ApprovalRequest }
  | { type: "done" }
```

### 对话循环

```
用户消息
→ 检索相关记忆（storage.recall）
→ 构建 prompt（system + 记忆 + 历史 + 工具定义）
→ 调用 LLM（ai.chatStream）
→ 解析响应
  → 文本回复 → yield text event
  → 工具调用 → 检查 dangerLevel
    → safe → 直接执行
    → confirm/dangerous → 调用 onApprovalNeeded 回调
      → approved → 执行
      → rejected → 告知 LLM 操作被拒绝
    → 将工具结果喂回 LLM → 继续循环
```

## 5. TUI 包 — 终端聊天界面

`@winches/tui` 是日常和 Agent 对话的主入口。

### 技术选型

- 渲染框架：ink（React 风格的终端 UI）
- 直接嵌入 `@winches/agent` 实例

### 核心功能

- 聊天界面：输入消息，流式显示 Agent 回复（逐 token 渲染）
- 工具调用可视化：显示工具名、参数、执行状态
- 审批交互：危险操作时在终端内弹出确认提示（Y/N）
- Markdown 渲染：代码块、列表等基本格式化
- 会话管理：新建/切换/列出历史会话

### 审批实现

TUI 实现 `onApprovalNeeded` 回调：在终端显示操作描述，等待用户输入 Y/N。

## 6. Gateway 包 — Telegram 接入

`@winches/gateway` 提供 Telegram Bot 接入，作为常驻进程 7×24 在线。

### 技术选型

- Telegram Bot 框架：grammy（TypeScript 原生，维护活跃）
- 直接嵌入 `@winches/agent` 实例

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
  provider: openai          # openai | anthropic | google | openai-compatible
  model: gpt-4o
  apiKey: ${AGENT_API_KEY}  # 支持环境变量引用
  baseUrl: null             # openai-compatible 时使用

embedding:
  provider: openai
  model: text-embedding-3-small

telegram:
  botToken: ${AGENT_TELEGRAM_TOKEN}

approval:
  timeout: 300              # 审批超时秒数，默认 5 分钟
  defaultAction: reject     # 超时后默认拒绝

storage:
  dbPath: ./data/agent.db

logging:
  level: info               # debug | info | warn | error
```

### 环境变量覆盖

所有配置项支持 `AGENT_*` 前缀的环境变量覆盖：
- `AGENT_LLM_PROVIDER`
- `AGENT_LLM_MODEL`
- `AGENT_API_KEY`
- `AGENT_TELEGRAM_TOKEN`

## 9. 错误处理

| 场景 | 策略 |
|------|------|
| LLM 调用失败 | 自动重试 3 次，指数退避，最终通知用户 |
| 工具执行失败 | 捕获错误，将错误信息作为 tool result 返回 LLM |
| Telegram 连接断开 | grammy 内置自动重连 |
| 浏览器崩溃 | Playwright 进程隔离，崩溃后自动重启新实例 |
| 审批超时 | 默认拒绝，通知 LLM 操作被拒绝 |

## 10. 部署

### 本地运行

```bash
npm run start:tui       # TUI 聊天模式
npm run start:gateway   # Telegram Bot 模式
npm run start:web-ui    # 管理面板
```

### Docker

提供 Dockerfile 和 docker-compose.yaml：
- gateway 容器：Telegram Bot 常驻运行
- web-ui 容器：管理面板
- 共享 volume 挂载 SQLite 数据文件和配置

## 11. 子项目拆分与实施顺序

由于整体项目较大，建议按以下顺序拆分为独立子项目，每个子项目走独立的 spec → plan → implementation 周期：

### Phase 1：基础层
1. **Monorepo 脚手架** — 项目初始化、npm workspaces、tsdown 构建、共享配置
2. **@winches/ai** — 统一 LLM 抽象层，先实现 OpenAI provider
3. **@winches/storage** — SQLite + sqlite-vec，对话存储和长期记忆

### Phase 2：核心能力
4. **@winches/core** — 工具注册表 + 文件操作工具（最基础的工具集）
5. **@winches/agent** — Agent 运行时，对话循环 + 工具调度 + 权限审批

### Phase 3：用户界面
6. **@winches/tui** — 终端聊天界面
7. **@winches/gateway** — Telegram Bot 接入

### Phase 4：扩展
8. **@winches/core 扩展** — 浏览器控制、网络请求、系统信息、剪贴板、定时任务工具
9. **@winches/web-ui** — 管理/调试面板

每个 phase 完成后都有可运行的产物，Phase 2 结束后就能通过代码调用 Agent，Phase 3 结束后就有完整的用户交互体验。
