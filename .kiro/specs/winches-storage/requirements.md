# 需求文档 — @winches/storage 持久化与长期记忆层

## 简介

`@winches/storage` 是 winches-agent monorepo 中的持久化层，提供所有数据存储能力。该包基于 SQLite（better-sqlite3）和 sqlite-vec 向量扩展，支持对话历史存储与检索、长期记忆的语义搜索、定时任务持久化、工具执行审计日志以及审批队列管理。Embedding 生成通过依赖 `@winches/ai` 包调用云端或本地模型实现。

## 术语表

- **Storage_Package**: `@winches/storage` 包，持久化层的 TypeScript 实现
- **StorageService**: 对外暴露所有存储能力的核心服务接口
- **Database**: 底层 SQLite 数据库实例（better-sqlite3）
- **Migration_Runner**: 按版本号顺序执行 SQL 迁移脚本的模块
- **Embedding_Service**: 调用 `@winches/ai` 生成文本向量的模块
- **Message**: 对话消息对象，包含角色（role）和内容（content），与 `@winches/ai` 定义一致
- **Session**: 一次独立的对话会话，由 sessionId 标识
- **Memory**: 长期记忆条目，包含内容、标签、时间戳和向量
- **ScheduledTask**: 定时任务对象，包含任务 ID、触发时间、执行内容和状态
- **ApprovalRequest**: 待审批的危险操作请求，包含操作描述和元数据
- **ApprovalStatus**: 审批状态，取值为 "pending"、"approved"、"rejected"、"timeout"
- **Vector**: 文本的浮点数数组表示，用于语义相似度计算

## 需求

### 需求 1：数据库初始化与 Schema 迁移

**用户故事：** 作为开发者，我希望 Storage 包能自动初始化数据库并管理 Schema 版本，以便在不丢失数据的情况下安全升级数据库结构。

#### 验收标准

1. WHEN StorageService 初始化时，THE Migration_Runner SHALL 检查当前数据库版本并按顺序执行所有未应用的 SQL 迁移脚本
2. THE Migration_Runner SHALL 使用版本号命名迁移脚本（如 `001_init.sql`、`002_add_memories.sql`），并按升序执行
3. IF 迁移脚本执行失败，THEN THE Migration_Runner SHALL 回滚当前迁移并抛出包含失败脚本名称和错误原因的描述性错误
4. THE Database SHALL 启用 WAL（Write-Ahead Logging）模式以提升并发读写性能
5. THE Database SHALL 启用外键约束（PRAGMA foreign_keys = ON）
6. WHEN 数据库文件路径不存在时，THE StorageService SHALL 自动创建所需的目录结构

### 需求 2：sqlite-vec 向量扩展加载

**用户故事：** 作为开发者，我希望 Storage 包能加载 sqlite-vec 扩展，以便支持向量相似度搜索功能。

#### 验收标准

1. WHEN StorageService 初始化时，THE Storage_Package SHALL 加载 sqlite-vec 扩展到 SQLite 实例
2. IF sqlite-vec 扩展加载失败，THEN THE Storage_Package SHALL 抛出包含加载失败原因的描述性错误
3. THE Storage_Package SHALL 导出当前加载的 sqlite-vec 版本信息，供调用方验证扩展可用性

### 需求 3：对话历史存储

**用户故事：** 作为 Agent 运行时，我希望能按会话保存和读取对话消息，以便在多轮对话中维持上下文。

#### 验收标准

1. WHEN 调用 saveMessage 时，THE StorageService SHALL 将 Message 对象与对应的 sessionId 和当前时间戳持久化到数据库
2. WHEN 调用 getHistory 时，THE StorageService SHALL 返回指定 sessionId 的消息列表，按时间戳升序排列
3. WHEN 调用 getHistory 时传入 limit 参数，THE StorageService SHALL 返回最近的 limit 条消息
4. IF sessionId 不存在，THEN THE StorageService SHALL 在 getHistory 调用时返回空数组
5. THE StorageService SHALL 支持存储 content 为字符串或 ContentPart 数组的 Message 对象

### 需求 4：对话历史语义搜索

**用户故事：** 作为 Agent 运行时，我希望能通过语义相似度搜索历史对话，以便检索与当前话题相关的历史上下文。

#### 验收标准

1. WHEN 调用 searchHistory 时，THE StorageService SHALL 使用 Embedding_Service 将查询文本转换为向量，并通过 sqlite-vec 返回语义最相似的消息列表
2. WHEN 调用 searchHistory 时传入 topK 参数，THE StorageService SHALL 返回相似度最高的 topK 条消息，默认 topK 为 5
3. THE StorageService SHALL 在 saveMessage 时异步生成并存储消息内容的向量，不阻塞消息保存操作
4. IF Embedding_Service 调用失败，THEN THE StorageService SHALL 记录错误日志，该条消息的向量字段保持为空，不影响消息的文本存储

### 需求 5：长期记忆存储与语义召回

**用户故事：** 作为 Agent 运行时，我希望能主动记住重要信息并通过语义搜索召回，以便在后续对话中利用用户偏好和历史知识。

#### 验收标准

1. WHEN 调用 remember 时，THE StorageService SHALL 将内容、可选标签数组和当前时间戳持久化为一条 Memory 记录
2. WHEN 调用 remember 时，THE StorageService SHALL 调用 Embedding_Service 生成内容向量并与 Memory 记录一同存储
3. WHEN 调用 recall 时，THE StorageService SHALL 使用 Embedding_Service 将查询文本转换为向量，并通过 sqlite-vec 返回语义最相似的 Memory 列表
4. WHEN 调用 recall 时传入 topK 参数，THE StorageService SHALL 返回相似度最高的 topK 条 Memory，默认 topK 为 5
5. THE StorageService SHALL 导出 Memory 接口，包含 id（string）、content（string）、tags（string[]）、createdAt（Date）和 vector（number[]）字段
6. IF Embedding_Service 调用失败，THEN THE StorageService SHALL 抛出错误，不保存该条 Memory 记录（向量是长期记忆的核心，无向量的记忆无法被语义召回）

### 需求 6：Embedding 生成服务

**用户故事：** 作为 Storage 包内部模块，我希望通过统一的 Embedding 服务生成文本向量，以便支持语义搜索功能。

#### 验收标准

1. THE Embedding_Service SHALL 通过 `@winches/ai` 包的 embedding 接口调用云端 embedding API 生成向量
2. THE Embedding_Service SHALL 支持通过配置切换 embedding 模型（如 `text-embedding-3-small`）
3. WHEN 调用 Embedding_Service 生成向量时，THE Embedding_Service SHALL 返回 number[] 类型的向量数组
4. IF embedding API 调用失败，THEN THE Embedding_Service SHALL 抛出包含失败原因的描述性错误
5. THE Storage_Package SHALL 从配置中读取 embedding.provider 和 embedding.model 字段以初始化 Embedding_Service

### 需求 7：定时任务持久化

**用户故事：** 作为 Agent 运行时，我希望定时任务能持久化存储，以便在进程重启后自动恢复待执行的任务。

#### 验收标准

1. WHEN 调用 saveScheduledTask 时，THE StorageService SHALL 将 ScheduledTask 对象持久化到数据库，包含任务 ID、触发时间、执行内容和初始状态 "pending"
2. WHEN 调用 getPendingTasks 时，THE StorageService SHALL 返回所有状态为 "pending" 且触发时间未过期的 ScheduledTask 列表，按触发时间升序排列
3. THE StorageService SHALL 导出 ScheduledTask 接口，包含 id（string）、triggerAt（Date）、payload（string）和 status（"pending" | "completed" | "cancelled"）字段
4. THE StorageService SHALL 提供 updateTaskStatus 方法，支持将任务状态更新为 "completed" 或 "cancelled"
5. IF 传入的 ScheduledTask id 已存在，THEN THE StorageService SHALL 在 saveScheduledTask 调用时抛出包含重复 ID 的描述性错误

### 需求 8：工具执行审计日志

**用户故事：** 作为系统管理员，我希望所有工具执行记录都被持久化，以便审计 Agent 的操作历史。

#### 验收标准

1. THE StorageService SHALL 提供 logToolExecution 方法，接受工具名称、输入参数、执行结果、耗时（毫秒）和可选的 sessionId
2. WHEN 调用 logToolExecution 时，THE StorageService SHALL 将工具执行记录与当前时间戳持久化到数据库
3. THE StorageService SHALL 提供 getToolExecutionLogs 方法，支持按 sessionId 和工具名称过滤，返回按时间戳降序排列的日志列表
4. WHEN 调用 getToolExecutionLogs 时传入 limit 参数，THE StorageService SHALL 返回最近的 limit 条日志记录，默认 limit 为 50

### 需求 9：审批队列管理

**用户故事：** 作为 Agent 运行时，我希望危险操作的审批请求能持久化存储，以便在进程重启后恢复待审批状态。

#### 验收标准

1. WHEN 调用 queueApproval 时，THE StorageService SHALL 将 ApprovalRequest 持久化到数据库，状态设为 "pending"，并返回生成的唯一 ID（string）
2. WHEN 调用 getApproval 时，THE StorageService SHALL 返回指定 ID 的 ApprovalStatus
3. IF 指定 ID 的审批记录不存在，THEN THE StorageService SHALL 在 getApproval 调用时抛出包含该 ID 的描述性错误
4. THE StorageService SHALL 提供 updateApprovalStatus 方法，支持将审批状态更新为 "approved"、"rejected" 或 "timeout"
5. THE StorageService SHALL 导出 ApprovalRequest 接口，包含 toolName（string）、params（unknown）、dangerLevel（string）和可选的 sessionId（string）字段
6. THE StorageService SHALL 导出 ApprovalStatus 类型，取值为 "pending"、"approved"、"rejected"、"timeout" 之一

### 需求 10：配置加载

**用户故事：** 作为开发者，我希望 Storage 包能从统一配置文件读取数据库路径和 embedding 配置，以便灵活管理不同环境的存储设置。

#### 验收标准

1. THE Storage_Package SHALL 从 YAML 配置文件中读取 storage.dbPath 字段作为 SQLite 数据库文件路径
2. THE Storage_Package SHALL 从 YAML 配置文件中读取 embedding.provider 和 embedding.model 字段以初始化 Embedding_Service
3. WHEN 环境变量 AGENT_STORAGE_DB_PATH 存在时，THE Storage_Package SHALL 使用该环境变量值覆盖配置文件中的 storage.dbPath
4. IF storage.dbPath 配置项缺失且 AGENT_STORAGE_DB_PATH 环境变量不存在，THEN THE Storage_Package SHALL 使用默认路径 `./data/agent.db`

### 需求 11：数据序列化与反序列化

**用户故事：** 作为开发者，我希望复杂对象（如 Message.content 数组、ScheduledTask.payload）能正确序列化存储和反序列化读取，以便保证数据完整性。

#### 验收标准

1. WHEN 存储 Message 对象时，THE StorageService SHALL 将 content 字段序列化为 JSON 字符串存入数据库
2. WHEN 读取 Message 对象时，THE StorageService SHALL 将数据库中的 JSON 字符串反序列化为原始 content 类型（string 或 ContentPart 数组）
3. FOR ALL 可存储的 Message 对象，存储后再读取，THE StorageService SHALL 返回与原始对象深度相等的 Message 对象（往返属性）
4. WHEN 存储 Memory 的 tags 字段时，THE StorageService SHALL 将 string[] 序列化为 JSON 字符串存入数据库，读取时反序列化还原
5. FOR ALL 可存储的 Memory 对象，存储后再读取，THE StorageService SHALL 返回与原始对象深度相等的 Memory 对象（往返属性）
