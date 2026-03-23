# 实现计划：@winches/storage 持久化与长期记忆层

## 概述

按模块逐步实现 `@winches/storage` 包，从类型定义、数据库初始化、Embedding 服务，到各业务存储功能，最终统一导出公共 API。每个任务在前一任务基础上递进，确保代码始终可集成。

## 任务列表

- [x] 1. 添加依赖并配置包环境
  - 在 `packages/storage/package.json` 中添加 `better-sqlite3`、`sqlite-vec`、`pino` 依赖，以及对应的 `@types/better-sqlite3` 开发依赖
  - 添加 `@winches/ai` 为 workspace 依赖
  - 添加 `fast-check` 为开发依赖（属性测试库）
  - 在 `packages/storage/package.json` 中添加 `vitest` 测试脚本
  - _需求：1.1, 2.1, 6.1_

- [x] 2. 定义核心类型与错误类
  - [x] 2.1 创建 `src/types.ts`，定义所有公共接口和类型
    - 定义 `StorageConfig`（dbPath、embedding.provider、embedding.model）
    - 定义 `Memory`（id、content、tags、createdAt、vector）
    - 定义 `ScheduledTask`（id、triggerAt、payload、status）
    - 定义 `ApprovalRequest`（toolName、params、dangerLevel、sessionId?）
    - 定义 `ApprovalStatus` 联合类型（"pending" | "approved" | "rejected" | "timeout"）
    - 定义 `ToolExecutionLog`（id、toolName、input、output、durationMs、sessionId?、createdAt）
    - _需求：5.5, 7.3, 9.5, 9.6_
  - [x] 2.2 创建 `src/errors.ts`，定义错误类
    - 定义 `StorageError extends Error`（包含 code 字段）
    - 定义 `MigrationError extends StorageError`（包含 scriptName 字段）
    - 定义 `EmbeddingError extends StorageError`
    - 定义 `DuplicateTaskError extends StorageError`（包含 taskId 字段）
    - 定义 `ApprovalNotFoundError extends StorageError`（包含 approvalId 字段）
    - _需求：1.3, 2.2, 5.6, 7.5, 9.3_

- [x] 3. 实现配置加载器
  - [x] 3.1 创建 `src/config.ts`，实现 `StorageConfigLoader`
    - 读取 YAML 配置文件中的 `storage.dbPath` 和 `embedding.*` 字段
    - 支持 `AGENT_STORAGE_DB_PATH` 环境变量覆盖 dbPath
    - 缺省 dbPath 使用 `./data/agent.db`
    - _需求：10.1, 10.2, 10.3, 10.4_
  - [ ]* 3.2 为 `StorageConfigLoader` 编写单元测试
    - 测试环境变量覆盖逻辑
    - 测试缺省路径回退逻辑
    - 测试 YAML 字段正确读取
    - _需求：10.3, 10.4_

- [x] 4. 实现数据库初始化与迁移
  - [x] 4.1 创建 `src/migrations/001_init.sql`，定义初始 Schema
    - 创建 `sessions` 表（id TEXT PRIMARY KEY）
    - 创建 `messages` 表（id、session_id FK、role、content TEXT、created_at）
    - 创建 `memories` 表（id、content、tags TEXT、created_at）
    - 创建 `scheduled_tasks` 表（id、trigger_at、payload、status、created_at）
    - 创建 `tool_execution_logs` 表（id、tool_name、input TEXT、output TEXT、duration_ms、session_id、created_at）
    - 创建 `approval_requests` 表（id、tool_name、params TEXT、danger_level、session_id、status、created_at）
    - _需求：1.1, 3.1, 5.1, 7.1, 8.1, 9.1_
  - [x] 4.2 创建 `src/database.ts`，实现 `Database` 初始化与 `MigrationRunner`
    - 使用 `better-sqlite3` 打开数据库，自动创建目录（`fs.mkdirSync` + `recursive: true`）
    - 启用 WAL 模式（`PRAGMA journal_mode = WAL`）
    - 启用外键约束（`PRAGMA foreign_keys = ON`）
    - 加载 `sqlite-vec` 扩展，失败时抛出 `StorageError`
    - 导出 `getVecVersion()` 函数返回 sqlite-vec 版本字符串
    - 实现 `MigrationRunner`：读取 `migrations/` 目录，按文件名升序执行未应用的脚本，失败时回滚并抛出 `MigrationError`
    - _需求：1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3_
  - [ ]* 4.3 为数据库初始化编写单元测试（使用 `:memory:` 数据库）
    - 测试 WAL 模式已启用
    - 测试外键约束已启用
    - 测试迁移按顺序执行
    - 测试迁移失败时回滚并抛出 `MigrationError`
    - _需求：1.1, 1.3, 1.4, 1.5_

- [x] 5. 实现 Embedding 服务
  - [x] 5.1 创建 `src/embedding.ts`，实现 `EmbeddingService`
    - 通过 OpenAI 兼容接口（`/v1/embeddings`）调用 embedding API，使用 `fetch` 直接请求
    - 从 `StorageConfig` 读取 `embedding.provider` 和 `embedding.model`
    - `embed(text: string): Promise<number[]>` 方法返回向量数组
    - 调用失败时抛出 `EmbeddingError`，包含失败原因
    - _需求：6.1, 6.2, 6.3, 6.4, 6.5_
  - [ ]* 5.2 为 `EmbeddingService` 编写单元测试（mock fetch）
    - 测试成功返回 `number[]`
    - 测试 API 失败时抛出 `EmbeddingError`
    - _需求：6.3, 6.4_

- [x] 6. 实现对话历史存储
  - [x] 6.1 创建 `src/storage.ts`，实现 `StorageService` 的对话历史方法
    - `saveMessage(sessionId, message)`: 序列化 `content` 为 JSON 字符串后持久化，异步触发向量生成（不 await，失败只记录日志）
    - `getHistory(sessionId, limit?)`: 按 `created_at` 升序返回，limit 取最近 N 条，sessionId 不存在返回 `[]`
    - 实现 `content` 字段的 JSON 序列化/反序列化（string 直接存储，ContentPart[] 序列化为 JSON）
    - _需求：3.1, 3.2, 3.3, 3.4, 3.5, 11.1, 11.2_
  - [ ]* 6.2 为 Message 往返序列化编写属性测试（PBT）
    - **属性 1：Message 往返一致性** — 对任意合法 Message 对象（content 为 string 或 ContentPart[]），saveMessage 后 getHistory 返回深度相等的对象
    - **验证：需求 11.3**
  - [x] 6.3 实现 `searchHistory(query, topK?)` 方法
    - 调用 `EmbeddingService` 将 query 转为向量
    - 通过 sqlite-vec 的 `vec_distance_cosine` 或 KNN 查询返回最相似的 topK 条消息（默认 5）
    - 需要在 `001_init.sql` 或新迁移中为 messages 表添加 `vec0` 虚拟表
    - _需求：4.1, 4.2_

- [x] 7. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户提问。

- [x] 8. 实现长期记忆存储
  - [x] 8.1 在 `src/storage.ts` 中实现 `remember` 和 `recall` 方法
    - `remember(content, tags?)`: 调用 `EmbeddingService` 生成向量（失败则抛出 `EmbeddingError`，不保存），将 `tags` 序列化为 JSON 字符串后持久化
    - `recall(query, topK?)`: 向量化 query，通过 sqlite-vec KNN 查询返回最相似的 topK 条 Memory（默认 5），反序列化 tags
    - 需要在迁移中为 memories 表添加 `vec0` 虚拟表
    - _需求：5.1, 5.2, 5.3, 5.4, 5.6, 11.4_
  - [ ]* 8.2 为 Memory 往返序列化编写属性测试（PBT）
    - **属性 2：Memory 往返一致性** — 对任意合法 Memory 对象（tags 为任意 string[]），remember 后 recall 返回深度相等的对象（content、tags 字段）
    - **验证：需求 11.5**
  - [ ]* 8.3 为长期记忆编写单元测试
    - 测试 `remember` 在 embedding 失败时抛出错误且不保存记录
    - 测试 `recall` 返回按相似度排序的结果
    - _需求：5.6_

- [x] 9. 实现定时任务持久化
  - [x] 9.1 在 `src/storage.ts` 中实现定时任务方法
    - `saveScheduledTask(task)`: 持久化任务，初始状态为 "pending"；若 id 已存在则抛出 `DuplicateTaskError`
    - `getPendingTasks()`: 返回状态为 "pending" 且 `trigger_at > now` 的任务，按 `trigger_at` 升序
    - `updateTaskStatus(id, status)`: 更新任务状态为 "completed" 或 "cancelled"
    - _需求：7.1, 7.2, 7.4, 7.5_
  - [ ]* 9.2 为定时任务编写单元测试
    - 测试重复 id 抛出 `DuplicateTaskError`
    - 测试 `getPendingTasks` 只返回未过期的 pending 任务
    - _需求：7.2, 7.5_

- [x] 10. 实现工具执行审计日志
  - [x] 10.1 在 `src/storage.ts` 中实现审计日志方法
    - `logToolExecution(toolName, input, output, durationMs, sessionId?)`: 持久化执行记录
    - `getToolExecutionLogs(filter?)`: 支持按 sessionId 和 toolName 过滤，按 `created_at` 降序，默认 limit 50
    - _需求：8.1, 8.2, 8.3, 8.4_
  - [ ]* 10.2 为审计日志编写单元测试
    - 测试按 sessionId 过滤
    - 测试按 toolName 过滤
    - 测试 limit 参数生效
    - _需求：8.3, 8.4_

- [x] 11. 实现审批队列管理
  - [x] 11.1 在 `src/storage.ts` 中实现审批队列方法
    - `queueApproval(request)`: 生成唯一 ID（`crypto.randomUUID()`），序列化 `params` 为 JSON，持久化后返回 ID
    - `getApproval(id)`: 返回 `ApprovalStatus`；若 ID 不存在则抛出 `ApprovalNotFoundError`
    - `updateApprovalStatus(id, status)`: 更新状态为 "approved"、"rejected" 或 "timeout"
    - _需求：9.1, 9.2, 9.3, 9.4_
  - [ ]* 11.2 为审批队列编写单元测试
    - 测试 `queueApproval` 返回唯一 ID
    - 测试 `getApproval` 在 ID 不存在时抛出 `ApprovalNotFoundError`
    - _需求：9.3_

- [x] 12. 统一导出公共 API
  - 更新 `src/index.ts`，导出所有公共类型、错误类和服务
  - 导出：`StorageService`、`StorageConfig`、`Memory`、`ScheduledTask`、`ApprovalRequest`、`ApprovalStatus`、`ToolExecutionLog`
  - 导出：`StorageError`、`MigrationError`、`EmbeddingError`、`DuplicateTaskError`、`ApprovalNotFoundError`
  - 导出：`StorageConfigLoader`、`EmbeddingService`、`getVecVersion`
  - _需求：2.3, 5.5, 7.3, 9.5, 9.6_

- [x] 13. 最终检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户提问。

## 备注

- 标有 `*` 的子任务为可选项，可跳过以加快 MVP 进度
- 每个任务引用具体需求条款以保证可追溯性
- 属性测试（PBT）使用 `fast-check` 库，验证数据序列化往返的普遍正确性
- sqlite-vec 向量表使用 `vec0` 虚拟表，KNN 查询语法参考 sqlite-vec 文档
- Embedding 服务直接通过 `fetch` 调用 OpenAI `/v1/embeddings` 接口，不依赖 `@winches/ai` 的 chat 接口（ai 包暂无 embedding 接口）
- 测试统一使用 `:memory:` 内存数据库，无需清理文件
