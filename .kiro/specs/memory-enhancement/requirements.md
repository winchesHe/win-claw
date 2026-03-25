# 需求文档

## 简介

本功能为 `@winches/storage` 包的记忆系统添加六项增强能力：

1. **重要性字段**：为 `Memory` 类型添加 `importance`（0.0–1.0），检索时融合重要性权重与语义相似度。
2. **时间衰减**：`recall()` 引入指数衰减因子，使近期记忆在相同语义相似度下获得更高排名。
3. **遗忘机制**：新增 `forget()` 方法，支持基于重要性、基于时间、基于容量三种清理策略。
4. **工作记忆 / 长期记忆分层**：显式建模两种记忆类型——工作记忆（当前会话上下文，有容量上限和 TTL）与长期记忆（跨会话知识）。
5. **情景记忆**：为 `messages` 表添加向量列，支持跨会话的语义检索，使 agent 能够回顾过去的对话经历。
6. **记忆摘要**：新增 `memorySummary()` 方法，返回各类型记忆的统计概览。

---

## 词汇表

- **Memory_System**：`@winches/storage` 包中负责记忆存储与检索的子系统。
- **Long_Term_Memory**：跨会话持久化的语义记忆，存储于 `memories` 表。
- **Working_Memory**：当前会话的短期上下文记忆，有容量上限（`capacity`）和存活时间（`TTL`）。
- **Episodic_Memory**：对话消息的向量化表示，存储于 `messages` 表的 `vector` 列，支持跨会话语义检索。
- **Importance**：附加在记忆条目上的重要性分值，取值范围 [0.0, 1.0]，默认值 0.5。
- **Decay_Factor**：时间衰减系数，用于计算记忆随时间降低的检索权重。
- **Composite_Score**：检索时综合语义相似度、重要性权重和时间衰减的最终排序分值。
- **Forget_Strategy**：遗忘策略枚举，包含 `importance`（按重要性）、`time`（按时间）、`capacity`（按容量）。
- **MemorySummary**：各类型记忆的统计概览，包含条数、平均重要性等聚合信息。
- **StorageService**：`@winches/storage` 对外暴露的核心服务接口。
- **SqliteStorageService**：`StorageService` 的 SQLite 实现类。
- **TTL**：Time-To-Live，工作记忆条目的最大存活时长（毫秒）。

---

## 需求

### 需求 1：重要性字段

**用户故事：** 作为开发者，我希望为每条记忆指定重要性分值，以便系统在检索时优先返回更重要的记忆。

#### 验收标准

1. THE `Memory` 接口 SHALL 包含 `importance` 字段，类型为 `number`，取值范围 [0.0, 1.0]。
2. WHEN 调用 `remember(content, tags, options)` 时未提供 `importance`，THE `Memory_System` SHALL 将 `importance` 默认设为 `0.5`。
3. IF 调用 `remember()` 时提供的 `importance` 值小于 0.0 或大于 1.0，THEN THE `Memory_System` SHALL 抛出 `InvalidImportanceError`。
4. THE `SqliteStorageService` SHALL 将 `importance` 持久化到 `memories` 表的 `importance` 列（REAL 类型）。
5. WHEN 调用 `recall(query, options)` 时，THE `Memory_System` SHALL 按照公式 `composite_score = semantic_similarity * (1 + importance_weight * importance)` 计算综合分值，其中 `importance_weight` 默认为 `0.3`。

---

### 需求 2：时间衰减

**用户故事：** 作为开发者，我希望近期记忆在检索时获得更高权重，以便系统优先返回时效性更强的信息。

#### 验收标准

1. WHEN 调用 `recall(query, options)` 时，THE `Memory_System` SHALL 对每条记忆应用指数衰减因子 `decay = exp(-λ * age_in_days)`，其中 `λ`（`decayRate`）默认为 `0.1`。
2. THE `Memory_System` SHALL 将时间衰减融入综合分值，最终公式为 `composite_score = semantic_similarity * decay * (1 + importance_weight * importance)`。
3. WHERE `recall()` 的调用方通过 `options.decayRate` 传入自定义衰减率，THE `Memory_System` SHALL 使用该值替代默认值 `0.1`。
4. WHERE `recall()` 的调用方通过 `options.importanceWeight` 传入自定义重要性权重，THE `Memory_System` SHALL 使用该值替代默认值 `0.3`。
5. IF `decayRate` 小于 0，THEN THE `Memory_System` SHALL 抛出 `InvalidDecayRateError`。

---

### 需求 3：遗忘机制

**用户故事：** 作为开发者，我希望能够按策略清理记忆，以便控制存储空间并移除过时或低价值的记忆。

#### 验收标准

1. THE `StorageService` 接口 SHALL 新增 `forget(strategy: ForgetStrategy, options: ForgetOptions): Promise<number>` 方法，返回值为实际删除的记忆条数。
2. WHEN 调用 `forget({ type: 'importance', threshold: t })` 时，THE `Memory_System` SHALL 删除所有 `importance < t` 的长期记忆条目。
3. WHEN 调用 `forget({ type: 'time', olderThanMs: d })` 时，THE `Memory_System` SHALL 删除所有 `createdAt < (now - d)` 的长期记忆条目。
4. WHEN 调用 `forget({ type: 'capacity', maxCount: n })` 时，THE `Memory_System` SHALL 保留 `composite_score`（`importance * decay`）最高的 `n` 条记忆，删除其余条目。
5. IF `forget()` 的 `options` 参数缺少对应策略所需的字段，THEN THE `Memory_System` SHALL 抛出 `InvalidForgetOptionsError`。
6. THE `Memory_System` SHALL 在单次数据库事务中执行 `forget()` 的所有删除操作，以保证原子性。

---

### 需求 4：工作记忆与长期记忆分层

**用户故事：** 作为开发者，我希望系统显式区分工作记忆和长期记忆，以便对当前会话上下文和跨会话知识分别管理。

#### 验收标准

1. THE `StorageService` 接口 SHALL 新增 `rememberWorking(content: string, sessionId: string, options?: WorkingMemoryOptions): Promise<WorkingMemory>` 方法，用于存储工作记忆。
2. THE `StorageService` 接口 SHALL 新增 `recallWorking(sessionId: string): Promise<WorkingMemory[]>` 方法，返回指定会话的全部有效工作记忆。
3. WHEN 调用 `recallWorking(sessionId)` 时，THE `Memory_System` SHALL 仅返回 `createdAt + ttl > now` 的工作记忆条目（即未过期条目）。
4. WHEN 某会话的工作记忆条目数量达到 `capacity` 上限时，THE `Memory_System` SHALL 在插入新条目前自动删除该会话中 `createdAt` 最早的一条工作记忆。
5. THE `WorkingMemory` 类型 SHALL 包含字段：`id`、`sessionId`、`content`、`createdAt`、`ttl`（毫秒）、`importance`。
6. WHERE 调用 `rememberWorking()` 时未提供 `ttl`，THE `Memory_System` SHALL 使用默认值 `3_600_000`（1 小时）。
7. WHERE 调用 `rememberWorking()` 时未提供 `capacity`，THE `Memory_System` SHALL 使用默认值 `50`（每会话最多 50 条）。
8. THE `SqliteStorageService` SHALL 将工作记忆持久化到独立的 `working_memories` 表，包含列：`id`、`session_id`、`content`、`created_at`、`ttl`、`importance`。
9. WHEN 调用 `recall(query, options)` 时，THE `Memory_System` SHALL 仅检索长期记忆（`memories` 表），不混入工作记忆结果。
10. WHEN 调用 `getHistory(sessionId)` 时，THE `Memory_System` SHALL 仅返回对话消息（`messages` 表），不混入工作记忆结果。

---

### 需求 5：情景记忆

**用户故事：** 作为开发者，我希望能够跨会话语义检索历史对话，以便 agent 能够回顾过去的交互经历。

#### 验收标准

1. THE `StorageService` 接口 SHALL 新增 `searchEpisodic(query: string, options?: EpisodicSearchOptions): Promise<EpisodicMemory[]>` 方法，支持跨会话的语义检索。
2. WHEN 调用 `saveMessage(sessionId, message)` 时，THE `Memory_System` SHALL 异步为消息内容生成 embedding 向量并存储到 `messages` 表的 `vector` 列。
3. WHEN 调用 `searchEpisodic(query)` 时，THE `Memory_System` SHALL 对所有已向量化的消息按余弦相似度排序，返回最相关的 `topK` 条（默认 5）。
4. THE `EpisodicMemory` 类型 SHALL 包含字段：`id`、`sessionId`、`role`、`content`、`createdAt`、`similarity`（检索时的相似度分值）。
5. WHERE 调用 `searchEpisodic()` 时通过 `options.sessionId` 指定会话，THE `Memory_System` SHALL 仅在该会话的消息中检索。
6. WHERE 调用 `searchEpisodic()` 时通过 `options.role` 指定角色（如 `"user"` 或 `"assistant"`），THE `Memory_System` SHALL 仅返回该角色的消息。
7. WHEN 消息内容为非文本类型（如 tool_calls）时，THE `Memory_System` SHALL 将其 JSON 序列化后生成 embedding，embedding 失败时静默跳过（不影响消息保存）。
8. THE `SqliteStorageService` SHALL 通过数据库迁移为 `messages` 表添加 `vector` 列（TEXT，可为 NULL）。

---

### 需求 6：记忆摘要

**用户故事：** 作为开发者，我希望能够快速获取记忆系统的统计概览，以便了解当前记忆状态。

#### 验收标准

1. THE `StorageService` 接口 SHALL 新增 `memorySummary(): Promise<MemorySummary>` 方法。
2. THE `MemorySummary` 类型 SHALL 包含以下字段：
   - `longTerm`：`{ count: number; avgImportance: number }`，长期记忆的条数和平均重要性
   - `working`：`{ count: number; activeCount: number }`，工作记忆总条数和未过期条数
   - `episodic`：`{ totalMessages: number; vectorizedCount: number }`，消息总数和已向量化条数
3. WHEN 调用 `memorySummary()` 时，THE `Memory_System` SHALL 通过单次数据库查询（或少量聚合查询）计算所有统计值，不加载完整记忆内容。
4. WHEN 各类型记忆均为空时，THE `Memory_System` SHALL 返回所有数值字段为 0 的 `MemorySummary` 对象，不抛出错误。
5. THE `working.activeCount` 字段 SHALL 仅统计 `created_at + ttl > now` 的未过期工作记忆条数。
