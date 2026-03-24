# 技术设计文档：@winches/gateway

## 概述

`@winches/gateway` 是 winches-agent 项目的 Telegram Bot 接入层，作为常驻进程 7×24 小时运行。它基于 [grammy](https://grammy.dev/) 框架实现，将 Telegram 消息路由到 `@winches/agent` 实例，并将 Agent 的流式事件（文本、工具调用、审批请求）转换为 Telegram 消息操作。

### 设计目标

- 每个 Telegram Chat 拥有独立的 Agent 实例和会话上下文
- 流式回复通过 1 秒节流的 `editMessageText` 实时更新
- 危险操作通过 InlineKeyboard 按钮交互审批
- 优雅退出时清理所有待审批请求，等待活跃请求完成

### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Bot 框架 | grammy | TypeScript 原生，类型安全，内置 Polling 重连 |
| 会话隔离 | 内存 Map + StorageService | 进程内快速访问，重启后通过 Storage 恢复历史 |
| 流式节流 | setInterval(1000ms) + done 立即刷新 | 平衡实时性与 Telegram API 限流（30 msg/s） |
| 审批等待 | Promise + Map 存储 resolve/reject | 解耦 CallbackQuery 处理与 Agent 等待逻辑 |
| 日志 | pino | 结构化日志，与其他包保持一致 |

---

## 架构

```mermaid
graph TD
    TG[Telegram 服务器] -->|Polling| BOT[GatewayBot]
    BOT -->|文本消息| MH[MessageHandler]
    BOT -->|命令| CH[CommandHandler]
    BOT -->|CallbackQuery| CBH[CallbackHandler]

    MH -->|agent.chat()| SM[SessionManager]
    SM -->|getOrCreate| AGENT[Agent 实例]
    AGENT -->|AgentEvent stream| MH

    MH -->|text events| TB[ThrottledBuffer]
    TB -->|editMessageText| TG
    MH -->|tool_call events| TG
    MH -->|approval_needed| AP[ApprovalManager]
    AP -->|sendMessage + InlineKeyboard| TG
    CBH -->|resolve/reject| AP

    SM -->|new Agent| STORAGE[StorageService]
    SM -->|new Agent| REGISTRY[ToolRegistry]
    SM -->|new Agent| PROVIDER[LLMProvider]
```

### 初始化流程

```
1. loadDotEnv()          — 向上查找 .env 文件
2. loadConfig()          — 读取 config.yaml，校验必填字段
3. createAIClient()      — 创建 LLM provider
4. openDatabase() + MigrationRunner + SqliteStorageService — 初始化存储
5. createDefaultRegistry() — 创建工具注册表
6. new GatewayBot(config, provider, storage, registry) — 创建 Bot
7. bot.start()           — 启动 Polling，注册信号处理器
```

---

## 文件结构

```
packages/gateway/src/
├── index.ts              # 入口：初始化 + 启动 Bot
├── config.ts             # 配置加载（复用 TUI 模式，增加 telegram.botToken）
├── types.ts              # GatewayConfig、ChatSession、PendingApproval 等类型
├── bot.ts                # GatewayBot 类（grammy Bot 封装，优雅退出）
├── session.ts            # SessionManager（ChatId → ChatSession 映射）
├── throttle.ts           # ThrottledBuffer（流式更新节流逻辑）
├── handlers/
│   ├── message.ts        # 文本消息处理（转发给 Agent，处理 AgentEvent 流）
│   ├── command.ts        # /start、/new、/status 命令处理
│   └── callback.ts       # InlineKeyboard 回调处理（审批 approve/reject）
└── __tests__/
    ├── config.test.ts    # 配置加载单元测试
    ├── session.test.ts   # SessionManager 属性测试
    ├── throttle.test.ts  # ThrottledBuffer 属性测试
    ├── handlers.test.ts  # 消息处理器属性测试
    └── approval.test.ts  # 审批逻辑属性测试
```

---

## 数据模型

### GatewayConfig

```typescript
interface GatewayConfig {
  llm: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
  embedding: {
    provider: string;
    model: string;
  };
  telegram: {
    botToken: string;
  };
  approval: {
    timeout: number;        // 秒，默认 300
    defaultAction: "approve" | "reject";
  };
  storage: {
    dbPath: string;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
}
```

### ChatSession

```typescript
interface ChatSession {
  chatId: number;
  sessionId: string;          // 格式：telegram-{chatId}-{timestamp}
  agent: Agent;
  /** 当前正在更新的回复消息 ID（流式更新期间有值） */
  activeMessageId?: number;
  /** 当前回复缓冲区内容 */
  replyBuffer: string;
  /** 上次 editMessageText 调用时间戳（ms） */
  lastEditAt: number;
  /** 工具调用 ID → Telegram 消息 ID 映射 */
  toolMessageMap: Map<string, number>;
}
```

### PendingApproval

```typescript
interface PendingApproval {
  approvalId: string;         // 唯一 ID，用于 CallbackQuery data
  chatId: number;
  messageId: number;          // 审批消息的 Telegram messageId
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;           // 防止重复触发
}
```

### CallbackData

```typescript
// InlineKeyboard 按钮的 callback_data 格式
// "approve:{approvalId}" 或 "reject:{approvalId}"
type CallbackData = `approve:${string}` | `reject:${string}`;
```

---

## 组件详细设计

### config.ts

复用 TUI 的 `loadConfig` 模式，增加 `telegram` 字段解析和 `AGENT_TELEGRAM_TOKEN` 环境变量覆盖。

```typescript
export class GatewayConfigError extends Error {
  constructor(message: string, public readonly field?: string) { ... }
}

export function loadConfig(configPath?: string): GatewayConfig
```

**校验规则：**
- `telegram.botToken`：必填，支持 `${AGENT_TELEGRAM_TOKEN}` 环境变量引用，环境变量 `AGENT_TELEGRAM_TOKEN` 优先覆盖
- `llm.provider`、`llm.apiKey`：必填（与 TUI 相同）
- 缺失任何必填字段时抛出 `GatewayConfigError`

### session.ts — SessionManager

```typescript
class SessionManager {
  private sessions: Map<number, ChatSession>;

  constructor(
    private provider: LLMProvider,
    private storage: StorageService,
    private registry: ToolRegistry,
  ) {}

  /** 获取或创建 ChatSession，保证同一 chatId 返回同一实例 */
  getOrCreate(chatId: number): ChatSession

  /** 为 chatId 创建新 Session（/new 命令），生成新 sessionId */
  reset(chatId: number): ChatSession

  /** 获取所有活跃 Session */
  all(): ChatSession[]
}
```

**sessionId 格式：** `telegram-{chatId}-{Date.now()}`

每次 `getOrCreate` 对同一 `chatId` 返回引用相同的 `ChatSession` 对象。`reset` 创建新 `Agent` 实例，生成新 `sessionId`，覆盖旧 Session。

### throttle.ts — ThrottledBuffer

封装流式更新的节流逻辑，与 Telegram API 调用解耦，便于单元测试。

```typescript
class ThrottledBuffer {
  private buffer: string = "";
  private lastSent: string = "";
  private lastEditAt: number = 0;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    private editFn: (text: string) => Promise<void>,
    private intervalMs: number = 1000,
  ) {}

  /** 追加文本到缓冲区 */
  append(content: string): void

  /** 启动节流定时器 */
  start(): void

  /** 停止定时器并立即刷新（done 事件调用） */
  async flush(): Promise<void>

  /** 停止定时器，不刷新 */
  stop(): void
}
```

**节流逻辑：**
- `setInterval` 每 1000ms 检查：若 `buffer !== lastSent`，调用 `editFn(buffer)`，更新 `lastSent` 和 `lastEditAt`
- `flush()` 停止定时器，若 `buffer !== lastSent` 则立即调用 `editFn(buffer)`

### bot.ts — GatewayBot

```typescript
class GatewayBot {
  private bot: Bot;
  private sessionManager: SessionManager;
  private pendingApprovals: Map<string, PendingApproval>;
  private logger: pino.Logger;
  private isShuttingDown: boolean = false;

  constructor(
    config: GatewayConfig,
    provider: LLMProvider,
    storage: StorageService,
    registry: ToolRegistry,
  )

  /** 注册所有 handler，启动 Polling，注册信号处理器 */
  async start(): Promise<void>

  /** 优雅退出：停止 Polling，拒绝所有待审批，等待活跃请求 */
  async shutdown(timeoutMs?: number): Promise<void>
}
```

**信号处理：**
```typescript
const shutdown = async () => {
  await bot.shutdown(30_000);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => { logger.fatal(err); process.exit(1); });
process.on("unhandledRejection", (err) => { logger.fatal(err); process.exit(1); });
```

### handlers/message.ts

处理文本消息的核心逻辑：

```
1. 检查 agent.getStatus() !== "idle" → 回复"Agent 正在处理上一条消息"
2. 发送占位消息"思考中…"，获取 messageId
3. 创建 ThrottledBuffer，editFn = ctx.api.editMessageText(chatId, messageId, text)
4. buffer.start()
5. 注册 agent.onApprovalNeeded = createApprovalHandler(ctx, pendingApprovals, config)
6. for await (const event of agent.chat([{ role: "user", content: text }])):
   - text: buffer.append(event.content)
   - tool_call: sendToolCallMessage(ctx, session, event)
   - tool_result: updateToolCallMessage(ctx, session, event)
   - approval_needed: 由 onApprovalNeeded 回调处理（已在步骤 5 注册）
   - done: await buffer.flush()
7. catch: 发送错误消息，重置 session（agent 状态由 Agent 内部 finally 重置）
```

**工具通知消息格式：**
```
🔧 调用工具：{toolName}
参数：{truncate(JSON.stringify(params), 200)}
```
dangerous 级别前缀 `⚠️`：
```
⚠️ 🔧 调用工具：{toolName}
参数：{truncate(JSON.stringify(params), 200)}
```

**工具结果更新格式（追加到原消息）：**
```
✅ 完成
```
或
```
❌ 失败：{truncate(errorMessage, 200)}
```

### handlers/command.ts

| 命令 | 处理逻辑 |
|------|---------|
| `/start` | 发送欢迎消息，包含功能简介和命令列表 |
| `/new` | `sessionManager.reset(chatId)`，回复"已开启新会话" |
| `/status` | 查询 `session.agent.getStatus()` 和 `session.sessionId`，格式化回复 |

### handlers/callback.ts

处理 InlineKeyboard 的 `callback_query` 事件：

```
1. 解析 callback_data：格式为 "approve:{approvalId}" 或 "reject:{approvalId}"
2. 查找 pendingApprovals.get(approvalId)
3. IF 不存在或 settled === true → answerCallbackQuery("该审批请求已超时")，返回
4. 标记 settled = true，清除 timer
5. 根据 action 调用 pending.resolve(true/false)
6. 更新审批消息文本（移除 InlineKeyboard）：
   - approve → "已批准 ✅"
   - reject → "已拒绝 ❌"
7. answerCallbackQuery()
```

### 审批流程（onApprovalNeeded）

```typescript
function createApprovalHandler(
  ctx: Context,
  pendingApprovals: Map<string, PendingApproval>,
  config: GatewayConfig,
): (request: ApprovalRequest) => Promise<boolean> {
  return async (request) => {
    const approvalId = crypto.randomUUID();
    const msg = await ctx.reply(formatApprovalMessage(request), {
      reply_markup: new InlineKeyboard()
        .text("✅ 批准", `approve:${approvalId}`)
        .text("❌ 拒绝", `reject:${approvalId}`),
    });

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const pending = pendingApprovals.get(approvalId);
        if (pending && !pending.settled) {
          pending.settled = true;
          pendingApprovals.delete(approvalId);
          const approved = config.approval.defaultAction === "approve";
          ctx.api.editMessageText(
            ctx.chat!.id, msg.message_id,
            `已超时自动${approved ? "批准" : "拒绝"} ⏱️`,
          ).catch(() => {});
          resolve(approved);
        }
      }, config.approval.timeout * 1000);

      pendingApprovals.set(approvalId, {
        approvalId, chatId: ctx.chat!.id,
        messageId: msg.message_id,
        resolve, timer, settled: false,
      });
    });
  };
}
```

---

## 正确性属性

*属性（Property）是在系统所有有效执行中都应成立的特征或行为——本质上是对系统应做什么的形式化陈述。属性是人类可读规范与机器可验证正确性保证之间的桥梁。*

### Property 1：配置必填字段校验

*对于任意* 缺少 `telegram.botToken`、`llm.provider` 或 `llm.apiKey` 中任一字段的配置对象，`loadConfig` 应抛出 `GatewayConfigError`。

**Validates: Requirements 1.2, 1.3**

### Property 2：环境变量覆盖配置

*对于任意* 有效的 bot token 字符串，当 `AGENT_TELEGRAM_TOKEN` 环境变量设置为该值时，`loadConfig` 返回的 `config.telegram.botToken` 应等于该环境变量值，无论 config.yaml 中的值为何。

**Validates: Requirements 1.4**

### Property 3：消息格式转换

*对于任意* 非空文本字符串，将其转换为 `Message` 格式后，`role` 应为 `"user"`，`content` 应等于原始文本。

**Validates: Requirements 2.1**

### Property 4：Agent 忙碌时拒绝新消息

*对于任意* Agent 状态为 `"running"` 或 `"waiting_approval"` 的 ChatSession，消息处理器不应调用 `agent.chat()`，且应返回忙碌提示。

**Validates: Requirements 2.3**

### Property 5：文本事件追加到缓冲区

*对于任意* `type: "text"` 事件序列，`ThrottledBuffer` 的内部缓冲区内容应等于所有 `content` 字段按顺序拼接的结果。

**Validates: Requirements 3.1**

### Property 6：流式更新节流

*对于任意* 在 `done` 事件之前的 `editMessageText` 调用序列，任意相邻两次调用之间的时间间隔不应小于 1000ms。

**Validates: Requirements 3.2**

### Property 7：done 事件触发最终更新

*对于任意* 文本事件序列后跟随 `done` 事件，`flush()` 调用后 `editFn` 接收到的最终文本应等于所有文本内容的完整拼接。

**Validates: Requirements 3.3**

### Property 8：内容未变化时跳过更新

*对于任意* 缓冲区内容与上次发送内容相同的状态，节流定时器触发时不应调用 `editFn`。

**Validates: Requirements 3.4**

### Property 9：工具通知消息格式

*对于任意* 工具名称、参数和危险等级，格式化后的工具通知消息应包含工具名称；当 `dangerLevel` 为 `"dangerous"` 时，消息应以 `⚠️` 开头。

**Validates: Requirements 4.1, 4.4**

### Property 10：工具参数/结果截断

*对于任意* 长度超过 200 字符的字符串，`truncate(str, 200)` 的结果长度不应超过 200 字符，且应以 `...` 结尾。

**Validates: Requirements 4.3**

### Property 11：审批按钮结果一致性

*对于任意* 待审批请求，点击"✅ 批准"按钮后 `onApprovalNeeded` 的 Promise 应 resolve 为 `true`；点击"❌ 拒绝"按钮后应 resolve 为 `false`。

**Validates: Requirements 5.2, 5.3**

### Property 12：审批超时自动处理

*对于任意* 超时时间和 `defaultAction` 配置，当审批请求超时后，Promise 应 resolve 为 `defaultAction === "approve"`（即 approve→true，reject→false）。

**Validates: Requirements 5.4**

### Property 13：超时后按钮点击幂等性

*对于任意* 已超时处理的审批请求，后续的 CallbackQuery 不应再次调用 `resolve`（`settled` 标志保证幂等性）。

**Validates: Requirements 5.6**

### Property 14：会话唯一性与复用

*对于任意* ChatId，`SessionManager.getOrCreate(chatId)` 的多次调用应返回引用相同的 `ChatSession` 对象；对于不同的 ChatId，应返回不同的 `ChatSession` 对象。

**Validates: Requirements 6.1, 6.2**

### Property 15：/new 命令重置 sessionId

*对于任意* 已存在的 ChatSession，调用 `SessionManager.reset(chatId)` 后，新 Session 的 `sessionId` 应与旧 Session 的 `sessionId` 不同，且格式符合 `telegram-{chatId}-{timestamp}`。

**Validates: Requirements 6.5**

### Property 16：异常后 Agent 状态重置

*对于任意* 在 `agent.chat()` 执行期间抛出异常的场景，异常被捕获后 `agent.getStatus()` 应返回 `"idle"`（由 Agent 内部 `finally` 块保证）。

**Validates: Requirements 7.1**

### Property 17：关闭时所有待审批请求被拒绝

*对于任意* 数量的待审批请求，调用 `GatewayBot.shutdown()` 后，所有 pending approval 的 Promise 应以 `false` resolve。

**Validates: Requirements 8.4**

---

## 错误处理

| 错误场景 | 处理方式 | 日志级别 |
|---------|---------|---------|
| 配置字段缺失 | 抛出 `GatewayConfigError`，打印到 stderr，exit(1) | — |
| `agent.chat()` 抛出异常 | 向 Chat 发送错误提示，继续服务 | error |
| `editMessageText` 返回 400（内容相同） | 静默忽略 | — |
| `editMessageText` 返回其他错误 | 记录日志，继续处理后续事件 | warn |
| StorageService 操作失败 | 记录日志，降级为无持久化模式 | error |
| grammy Polling 中断 | 依赖 grammy 内置重连 | warn |
| grammy 重连失败超过 10 次 | exit(1) | error |
| `uncaughtException` / `unhandledRejection` | exit(1) | fatal |

---

## 测试策略

### 双轨测试方法

单元测试和属性测试互补，共同保证正确性：
- **单元测试**：验证具体示例、边界条件和错误场景
- **属性测试**：通过随机输入验证普遍性质

### 属性测试配置

使用 [fast-check](https://fast-check.io/) 进行属性测试，每个属性测试最少运行 100 次迭代。

每个属性测试必须包含注释标记：
```
// Feature: winches-gateway, Property {N}: {property_text}
```

### 单元测试重点

- `config.ts`：各种缺失字段组合、环境变量覆盖、YAML 解析错误
- `handlers/callback.ts`：已超时请求的按钮点击、正常审批流程
- `handlers/command.ts`：/start、/new、/status 命令的回复内容
- `handlers/message.ts`：非文本消息拒绝、Agent 忙碌时的拒绝

### 属性测试重点

每个 Property（1-17）对应一个属性测试，使用 fast-check 生成器：

```typescript
// Property 14 示例
// Feature: winches-gateway, Property 14: 会话唯一性与复用
it("同一 chatId 返回同一 Session 实例", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1 }), (chatId) => {
      const manager = new SessionManager(mockProvider, mockStorage, mockRegistry);
      const s1 = manager.getOrCreate(chatId);
      const s2 = manager.getOrCreate(chatId);
      expect(s1).toBe(s2);
    }),
    { numRuns: 100 },
  );
});
```

### 依赖 Mock 策略

- `LLMProvider`：返回预设事件序列的 mock
- `StorageService`：内存实现的 mock
- `ToolRegistry`：空注册表
- `ctx.api`（grammy）：记录调用的 spy 对象
- `setTimeout`/`setInterval`：使用 Vitest 的 fake timers

---

## 依赖列表

### 运行时依赖

| 包 | 用途 |
|----|------|
| `grammy` | Telegram Bot 框架 |
| `pino` | 结构化日志 |
| `yaml` | 解析 config.yaml |
| `@winches/agent` | Agent 实例 |
| `@winches/ai` | LLM Provider 工厂 |
| `@winches/core` | 工具注册表 |
| `@winches/storage` | 持久化存储 |

### 开发依赖

| 包 | 用途 |
|----|------|
| `vitest` | 测试框架 |
| `fast-check` | 属性测试库 |
| `tsdown` | 构建工具 |
| `typescript` | 编译器（strict mode，ESM） |
