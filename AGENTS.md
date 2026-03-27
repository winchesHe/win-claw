# AGENTS.md

## 项目概览

winches-agent 是一个基于 TypeScript 的个人 7×24 小时 AI Agent 助手，支持本地文件操作、Shell 命令执行、Telegram 接入和终端交互。项目采用 pnpm workspaces monorepo 架构，包含 7 个子包，遵循嵌入式库模式（Agent 作为库被宿主程序嵌入，而非独立服务）。

### 技术栈

- 语言：TypeScript（strict mode，ESM only）
- 运行时：Node.js ≥ 22
- 包管理：pnpm workspaces
- 构建：tsdown（基于 Rolldown）
- 测试：Vitest + fast-check（属性测试）
- 代码规范：ESLint + Prettier
- 日志：pino（JSON 结构化日志）
- 数据库：SQLite（better-sqlite3 + sqlite-vec 向量扩展）
- Embedding：本地 Xenova/all-MiniLM-L6-v2（@huggingface/transformers）

### 包结构与依赖关系

```
@winches/ai        — 统一 LLM 抽象层（无内部依赖；provider SDK 为 optional peerDependencies）
@winches/storage   — 持久化层（依赖 ai，用于 embedding）
@winches/core      — 工具注册表 + 内置工具（依赖 ai）
@winches/agent     — Agent 运行时（依赖 ai、core、storage）
@winches/tui       — 终端聊天界面（依赖 agent、ai、core、storage）
@winches/gateway   — Telegram Bot 接入（依赖 agent、ai、core、storage）
@winches/web-ui    — 管理面板（Phase 4，尚未实现）
```

依赖方向严格单向：`ai → storage/core → agent → tui/gateway`。

## 环境搭建

### 前置条件

- Node.js 22+
- pnpm（通过 `corepack enable` 启用）

### 安装与配置

```bash
pnpm install
cp .env.example .env
# 编辑 .env 填入 AGENT_API_KEY 和 AGENT_TELEGRAM_TOKEN
```

### 环境变量

所有环境变量以 `AGENT_` 为前缀，优先级高于 `config.yaml`：

| 变量 | 说明 | 必填 |
|------|------|------|
| `AGENT_API_KEY` | LLM API Key | 是 |
| `AGENT_LLM_PROVIDER` | Provider 覆盖（openai / anthropic / google / openai-compatible） | 否 |
| `AGENT_LLM_MODEL` | 模型覆盖 | 否 |
| `AGENT_LLM_BASE_URL` | 自定义 endpoint（openai-compatible 时使用） | 否 |
| `AGENT_TELEGRAM_TOKEN` | Telegram Bot Token | Gateway 必填 |
| `AGENT_STORAGE_DB_PATH` | SQLite 路径（默认 `./data/agent.db`） | 否 |

### 配置文件

项目根目录 `config.yaml` 是主配置文件，支持 `${ENV_VAR}` 语法引用环境变量。修改 LLM provider、模型、embedding、审批超时等均在此文件。

## 常用命令

```bash
# 安装依赖
pnpm install

# 构建所有子包
pnpm build

# 并行启动所有子包的 dev 模式（tsdown --watch）
pnpm dev

# 代码质量检查（ESLint + Prettier + TypeScript 类型检查）
pnpm check

# 运行全部测试
pnpm test

# 清理所有构建产物
pnpm clean

# 启动 TUI（终端聊天，tsx 直接运行无需预编译）
pnpm start:tui

# 启动 Gateway（Telegram Bot，需先 pnpm build）
pnpm start:gateway
```

### 针对单个子包操作

```bash
# 构建单个包
pnpm --filter @winches/agent run build

# 运行单个包的测试
pnpm --filter @winches/storage run test

# 开发模式（watch）
pnpm --filter @winches/ai run dev
```

## 测试

### 框架与配置

- 框架：Vitest（根目录 `vitest.config.ts` 统一配置）
- 属性测试：fast-check（用于边界条件和不变量验证）
- 测试文件位置：`packages/*/src/__tests__/*.test.ts`
- 命名约定：`*.test.ts`（也支持 `*.spec.ts`）
- 配置：`passWithNoTests: true`，coverage 输出到 `coverage/`

### 运行测试

```bash
# 全部测试
pnpm test

# 运行特定包的测试
pnpm --filter @winches/agent run test

# 运行匹配特定名称的测试
pnpm vitest run -t "Agent 构造函数"

# 运行单个测试文件
pnpm vitest run packages/agent/src/__tests__/agent.test.ts
```

### 测试编写规范

- 使用 `describe` / `it` 组织，描述用中文
- Mock 依赖通过辅助函数创建（如 `makeMockProvider()`、`makeMockStorage()`）
- `StorageService` mock 需要实现完整接口（约 20 个方法）
- `LLMProvider` mock 需要实现 `chat` 和 `chatStream`（后者返回 `AsyncIterable<ChatChunk>`）
- 属性测试使用 `fast-check` 的 `fc.assert` + `fc.asyncProperty` 模式
- 修改代码后务必运行 `pnpm test` 确保全部通过

## 代码风格

### TypeScript 规范

- 严格模式：`strict: true`
- 模块系统：ESM only（`"type": "module"`），使用 `NodeNext` 模块解析
- 导入路径：必须带 `.js` 后缀（如 `import { Agent } from "./agent.js"`）
- 类型导入：使用 `import type` 语法（`verbatimModuleSyntax: true`）
- Target：ES2022
- 声明文件：自动生成（`declaration: true`）

### Prettier 配置

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

### ESLint 配置

- 基于 `@eslint/js` recommended + `typescript-eslint` recommended
- 集成 `eslint-config-prettier` 避免与 Prettier 冲突
- 忽略：`dist/`、`coverage/`、`node_modules/`、`.kiro/`、`.specify/`

### 命名约定

- 文件名：kebab-case（如 `openai-compatible.ts`）
- 类名：PascalCase（如 `ToolRegistry`、`SqliteStorageService`）
- 接口名：PascalCase，不加 `I` 前缀（如 `StorageService`、`LLMProvider`）
- 类型名：PascalCase（如 `AgentEvent`、`DangerLevel`）
- 函数名：camelCase（如 `createDefaultRegistry`、`buildMessages`）
- 工具内部名：点分格式（如 `file.read`、`shell.exec`），LLM 交互时自动转为 `file-read`
- 包 scope：`@winches/*`

### 导出模式

每个包通过 `src/index.ts` 统一导出公共 API：
- 类型用 `export type { ... }` 导出
- 类和函数用 `export { ... }` 导出
- 按类别分组注释（Types、Errors、Core classes、Providers 等）

### 错误处理模式

- 每个包定义自己的错误基类（如 `AgentError`、`AIError`、`CoreError`、`StorageError`）
- 错误类继承自 `Error`，设置 `this.name`
- 特定错误类携带上下文字段（如 `AgentConfigError.missingField`）
- 工具执行错误通过 `ToolResult` 的 `{ success: false, error: string }` 返回，不抛异常
- LLM 调用失败自动重试（指数退避，最多 3 次）

## 构建

### 构建工具

所有子包使用 tsdown（基于 Rolldown），配置文件为各包根目录的 `tsdown.config.ts`：

```typescript
import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  outDir: "dist",
  dts: true,
  clean: true,
  hash: false,
});
```

### 构建产物

- 输出目录：各包 `dist/`
- 格式：ESM（`.js` + `.d.ts`）
- `@winches/storage` 构建时额外复制 `src/migrations/` 到 `dist/migrations/`

### Docker 构建

```bash
docker build -t winches-agent .
```

多阶段构建：builder 阶段安装依赖并构建，runner 阶段仅复制产物。入口点由部署场景决定。

## 架构要点

### 嵌入式库模式

Agent 不是独立服务，而是被 TUI 和 Gateway 直接 import 使用：

1. 宿主程序（TUI/Gateway）负责初始化所有服务实例（AIClient、StorageService、ToolRegistry）
2. 将实例注入 `Agent` 构造函数
3. 通过 `agent.chat(messages)` 获取 `AsyncIterable<AgentEvent>` 流式事件
4. 宿主程序实现 `onApprovalNeeded` 回调处理权限审批 UI

### Agent 对话循环

```
用户消息 → 保存到 storage → 检索相关记忆（recall）
→ 构建 prompt（system + 记忆 + 历史 + 工具定义）
→ 调用 LLM（chatStream）→ 解析响应
  → 纯文本 → yield text event → 保存 → done
  → 工具调用 → 检查 dangerLevel
    → safe → 直接执行
    → confirm/dangerous → onApprovalNeeded 回调
  → 工具结果喂回 LLM → 继续循环（最多 maxIterations 轮）
```

### 工具权限三级模型

| 级别 | 行为 | 示例 |
|------|------|------|
| `safe` | 直接执行 | file.read、file.list |
| `confirm` | 需用户确认 | file.write、file.move |
| `dangerous` | 需明确批准，支持超时自动拒绝 | file.delete、shell.exec |

### 三层记忆架构

| 层级 | 生命周期 | 检索方式 |
|------|----------|----------|
| 长期记忆 | 永久 | 向量相似度 × 时间衰减 × 重要性权重 |
| 工作记忆 | 会话级，TTL 1h | 按 sessionId 查询 |
| 情景记忆 | 随对话永久保存 | 对话消息的向量语义搜索 |

### 工具名称转换

工具内部使用点分命名（`file.read`），LLM API 交互时自动转换为连字符格式（`file-read`）。转换通过 `@winches/core` 的 `sanitizeToolName` / `restoreToolName` 完成。

## 新增子包指南

1. 在 `packages/` 下创建目录
2. 创建 `package.json`（name 为 `@winches/<name>`，`"type": "module"`）
3. 创建 `tsconfig.json`（extends 根目录 `../../tsconfig.json`）
4. 创建 `tsdown.config.ts`（复制现有包的配置）
5. 创建 `src/index.ts` 作为公共 API 入口
6. 创建 `src/types.ts` 定义类型
7. 创建 `src/errors.ts` 定义错误类
8. 使用 `workspace:*` 引用内部依赖

## 数据库迁移

Storage 包使用版本号 + SQL 脚本的轻量迁移方案（不使用 ORM）：

- 迁移文件位于 `packages/storage/src/migrations/`
- 命名格式：`NNN_description.sql`（如 `001_init.sql`）
- 通过 `MigrationRunner` 自动执行，按版本号顺序应用
- 新增迁移：创建下一个编号的 `.sql` 文件即可

## 已知限制与 TODO

- Phase 4 工具（browser、http、system、clipboard、scheduler）已有定义文件但未实现 execute
- `@winches/web-ui` 仅有空的 index.ts
- TUI 和 Gateway 的 bootstrap 代码高度重复，应提取到共享模块

## PR 提交规范

- 提交前运行 `pnpm check` 和 `pnpm test`
- 修改代码时同步更新或新增对应的测试
- 移动文件或修改 import 后运行 `pnpm check` 确认无遗漏
- 确保 `pnpm build` 能成功构建所有子包
