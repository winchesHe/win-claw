# 实现计划：memory-enhancement

## 概述

按依赖顺序实现记忆子系统的四项增强：重要性字段、时间衰减、遗忘机制、工作记忆分层。
先扩展数据库 schema，再扩展类型与错误，最后实现 `SqliteStorageService` 的各方法，并配套属性测试。

## 任务

- [x] 1. 数据库迁移
  - [x] 1.1 创建迁移文件 `004_add_memory_importance.sql`
    - 在 `memories` 表添加 `importance REAL NOT NULL DEFAULT 0.5` 列
    - _需求：1.4_
  - [x] 1.2 创建迁移文件 `005_add_working_memories.sql`
    - 创建 `working_memories` 表，包含列：`id`、`session_id`、`content`、`created_at`、`ttl`、`importance`
    - 创建索引 `idx_working_memories_session ON working_memories (session_id, created_at)`
    - _需求：4.8_

- [x] 2. 类型定义扩展（types.ts）
  - [x] 2.1 扩展 `Memory` 接口，添加 `importance: number` 字段
    - _需求：1.1_
  - [x] 2.2 新增 `RememberOptions` 接口，包含可选字段 `importance?: number`
    - _需求：1.2_
  - [x] 2.3 新增 `RecallOptions` 接口，包含可选字段 `topK?`、`decayRate?`、`importanceWeight?`
    - _需求：2.1、2.3、2.4_
  - [x] 2.4 新增 `ForgetStrategy` 联合类型（`importance` / `time` / `capacity` 三种变体）
    - _需求：3.1、3.2、3.3、3.4_
  - [x] 2.5 新增 `WorkingMemoryOptions` 接口，包含可选字段 `ttl?`、`capacity?`、`importance?`
    - _需求：4.6、4.7_
  - [x] 2.6 新增 `WorkingMemory` 接口，包含字段：`id`、`sessionId`、`content`、`createdAt`、`ttl`、`importance`
    - _需求：4.5_
  - [x] 2.7 扩展 `StorageService` 接口，添加三个新方法签名：
    - `remember(content, tags?, options?: RememberOptions): Promise<Memory>`（更新现有签名）
    - `recall(query, topK?, options?: RecallOptions): Promise<Memory[]>`（更新现有签名）
    - `forget(strategy: ForgetStrategy): Promise<number>`
    - `rememberWorking(content, sessionId, options?: WorkingMemoryOptions): Promise<WorkingMemory>`
    - `recallWorking(sessionId): Promise<WorkingMemory[]>`
    - _需求：3.1、4.1、4.2_

- [x] 3. 新增错误类型（errors.ts）
  - [x] 3.1 新增 `InvalidImportanceError`，code 为 `INVALID_IMPORTANCE`
    - _需求：1.3_
  - [x] 3.2 新增 `InvalidDecayRateError`，code 为 `INVALID_DECAY_RATE`
    - _需求：2.5_
  - [x] 3.3 新增 `InvalidForgetOptionsError`，code 为 `INVALID_FORGET_OPTIONS`
    - _需求：3.5_

- [x] 4. 实现 `remember()` 重要性支持（storage.ts）
  - [x] 4.1 更新 `remember()` 方法签名，接受第三个可选参数 `options?: RememberOptions`
    - 校验 `importance` 范围，越界时抛出 `InvalidImportanceError`（不写入数据库）
    - 将 `importance` 写入 `memories` 表的 `importance` 列，未提供时默认 `0.5`
    - 更新 `MemoryRow` 内部接口，添加 `importance` 字段
    - 更新 `remember()` 返回值，包含 `importance` 字段
    - _需求：1.1、1.2、1.3、1.4_
  - [ ]* 4.2 为 `remember()` 编写属性测试（`memory-importance.test.ts`）
    - **属性 1：remember 重要性 round-trip**
    - **验证需求：1.1、1.2、1.4**
  - [ ]* 4.3 为 `remember()` 编写属性测试（`memory-importance.test.ts`）
    - **属性 2：importance 越界抛出错误**
    - **验证需求：1.3**

- [x] 5. 实现 `recall()` 综合评分（storage.ts）
  - [x] 5.1 更新 `recall()` 方法签名，接受第三个可选参数 `options?: RecallOptions`
    - 校验 `decayRate`，为负数时抛出 `InvalidDecayRateError`
    - 按公式 `composite_score = semantic_similarity × exp(-λ × age_in_days) × (1 + w × importance)` 计算综合分值
    - 使用 `options.decayRate`（默认 `0.1`）和 `options.importanceWeight`（默认 `0.3`）
    - 更新 `MemoryRow` 读取 `importance` 字段，更新返回的 `Memory` 对象包含 `importance`
    - _需求：1.5、2.1、2.2、2.3、2.4、2.5_
  - [ ]* 5.2 为 `recall()` 编写属性测试（`memory-recall-scoring.test.ts`）
    - **属性 3：综合评分排序正确性**
    - **验证需求：1.5、2.1、2.2**
  - [ ]* 5.3 为 `recall()` 编写属性测试（`memory-recall-scoring.test.ts`）
    - **属性 4：自定义衰减率与重要性权重生效**
    - **验证需求：2.3、2.4**
  - [ ]* 5.4 为 `recall()` 编写属性测试（`memory-recall-scoring.test.ts`）
    - **属性 5：decayRate 为负数时抛出错误**
    - **验证需求：2.5**

- [x] 6. 检查点 —— 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 7. 实现 `forget()` 方法（storage.ts）
  - [x] 7.1 实现 `forget(strategy: ForgetStrategy): Promise<number>`
    - 校验 `strategy` 参数，缺少必要字段时抛出 `InvalidForgetOptionsError`（不执行删除）
    - `importance` 策略：在事务中删除 `importance < threshold` 的所有记忆
    - `time` 策略：在事务中删除 `created_at < (now - olderThanMs)` 的所有记忆
    - `capacity` 策略：在事务中保留 `retention_score = importance × exp(-0.1 × age_in_days)` 最高的 `maxCount` 条，删除其余
    - 所有删除操作在单次事务中原子执行，返回实际删除条数
    - _需求：3.1、3.2、3.3、3.4、3.5、3.6_
  - [ ]* 7.2 为 `forget()` 编写属性测试（`memory-forget.test.ts`）
    - **属性 6：forget(importance) 删除低重要性记忆**
    - **验证需求：3.1、3.2**
  - [ ]* 7.3 为 `forget()` 编写属性测试（`memory-forget.test.ts`）
    - **属性 7：forget(time) 删除过期记忆**
    - **验证需求：3.1、3.3**
  - [ ]* 7.4 为 `forget()` 编写属性测试（`memory-forget.test.ts`）
    - **属性 8：forget(capacity) 保留 top-N**
    - **验证需求：3.1、3.4**
  - [ ]* 7.5 为 `forget()` 编写属性测试（`memory-forget.test.ts`）
    - **属性 9：forget() 参数缺失时抛出错误**
    - **验证需求：3.5**

- [x] 8. 实现 `rememberWorking()` 与 `recallWorking()`（storage.ts）
  - [x] 8.1 实现 `rememberWorking(content, sessionId, options?): Promise<WorkingMemory>`
    - 插入前检查该会话工作记忆条数是否达到 `capacity`（默认 50），若达到则先删除 `created_at` 最早的一条
    - 将新条目写入 `working_memories` 表，`ttl` 默认 `3_600_000`，`importance` 默认 `0.5`
    - 返回完整的 `WorkingMemory` 对象
    - _需求：4.1、4.4、4.5、4.6、4.7、4.8_
  - [x] 8.2 实现 `recallWorking(sessionId): Promise<WorkingMemory[]>`
    - 仅返回 `created_at + ttl > now` 的未过期条目
    - 按 `created_at ASC` 排序
    - _需求：4.2、4.3_
  - [ ]* 8.3 为工作记忆编写属性测试（`working-memory.test.ts`）
    - **属性 10：工作记忆 round-trip（存取一致）**
    - **验证需求：4.1、4.2、4.5、4.6、4.8**
  - [ ]* 8.4 为工作记忆编写属性测试（`working-memory.test.ts`）
    - **属性 11：recallWorking() 过滤过期条目**
    - **验证需求：4.3**
  - [ ]* 8.5 为工作记忆编写属性测试（`working-memory.test.ts`）
    - **属性 12：工作记忆容量淘汰**
    - **验证需求：4.4、4.7**
  - [ ]* 8.6 为工作记忆编写属性测试（`working-memory.test.ts`）
    - **属性 13：recall() 与 recallWorking() 结果隔离**
    - **验证需求：4.9、4.10**

- [x] 9. 更新 index.ts 导出（已有类型）
  - 导出新增的类型：`RememberOptions`、`RecallOptions`、`ForgetStrategy`、`WorkingMemoryOptions`、`WorkingMemory`
  - 导出新增的错误类：`InvalidImportanceError`、`InvalidDecayRateError`、`InvalidForgetOptionsError`
  - _需求：1.1、2.1、3.1、4.1_

- [x] 10. 数据库迁移：messages 表添加 vector 列
  - [x] 10.1 创建迁移文件 `006_add_message_vectors.sql`
    - 为 `messages` 表添加 `vector TEXT` 列（可为 NULL，存储 JSON 序列化的 number[]）
    - _需求：5.8_

- [x] 11. 类型定义扩展：情景记忆与记忆摘要（types.ts）
  - [x] 11.1 新增 `EpisodicSearchOptions` 接口，包含可选字段 `topK?`、`sessionId?`、`role?`
    - _需求：5.1、5.5、5.6_
  - [x] 11.2 新增 `EpisodicMemory` 接口，包含字段：`id`、`sessionId`、`role`、`content`、`createdAt`、`similarity`
    - _需求：5.4_
  - [x] 11.3 新增 `MemorySummary` 接口，包含 `longTerm`、`working`、`episodic` 三个嵌套对象
    - _需求：6.2_
  - [x] 11.4 扩展 `StorageService` 接口，添加两个新方法签名：
    - `searchEpisodic(query: string, options?: EpisodicSearchOptions): Promise<EpisodicMemory[]>`
    - `memorySummary(): Promise<MemorySummary>`
    - _需求：5.1、6.1_

- [x] 12. 实现情景记忆（storage.ts）
  - [x] 12.1 更新 `saveMessage()`，在保存消息后异步生成 embedding 并写入 `messages.vector` 列
    - embedding 失败时静默跳过（仅记录日志），不影响消息保存
    - 非文本内容（tool_calls 等）JSON 序列化后生成 embedding
    - _需求：5.2、5.7_
  - [x] 12.2 实现 `searchEpisodic(query, options?): Promise<EpisodicMemory[]>`
    - 对所有 `vector IS NOT NULL` 的消息按余弦相似度排序
    - 支持 `options.sessionId` 过滤（WHERE session_id = ?）
    - 支持 `options.role` 过滤（WHERE role = ?）
    - 返回 topK 条（默认 5），结果包含 `similarity` 字段
    - _需求：5.1、5.3、5.5、5.6_
  - [ ]* 12.3 为情景记忆编写属性测试（`episodic-memory.test.ts`）
    - **属性 14：searchEpisodic() 仅返回已向量化消息**
    - **验证需求：5.3**
  - [ ]* 12.4 为情景记忆编写属性测试（`episodic-memory.test.ts`）
    - **属性 15：searchEpisodic() 会话过滤正确性**
    - **验证需求：5.5**

- [x] 13. 实现记忆摘要（storage.ts）
  - [x] 13.1 实现 `memorySummary(): Promise<MemorySummary>`
    - `longTerm.count`：`SELECT COUNT(*) FROM memories`
    - `longTerm.avgImportance`：`SELECT AVG(importance) FROM memories`（空表返回 0）
    - `working.count`：`SELECT COUNT(*) FROM working_memories`
    - `working.activeCount`：`SELECT COUNT(*) FROM working_memories WHERE created_at + ttl > ?`（now）
    - `episodic.totalMessages`：`SELECT COUNT(*) FROM messages`
    - `episodic.vectorizedCount`：`SELECT COUNT(*) FROM messages WHERE vector IS NOT NULL`
    - _需求：6.1、6.2、6.3、6.4、6.5_
  - [ ]* 13.2 为记忆摘要编写属性测试（`memory-summary.test.ts`）
    - **属性 16：memorySummary() 统计值与实际数据一致**
    - **验证需求：6.2、6.5**

- [x] 14. 更新 index.ts 导出（新增类型）
  - 导出新增的类型：`EpisodicSearchOptions`、`EpisodicMemory`、`MemorySummary`
  - _需求：5.1、6.1_

- [x] 15. 最终检查点 —— 确保所有测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

## 备注

- 标有 `*` 的子任务为可选属性测试，可跳过以加快 MVP 交付
- 每个属性测试文件对应设计文档中的一组属性，注释格式：`// Feature: memory-enhancement, Property N: <属性描述>`
- 每个属性测试最少运行 100 次迭代（fast-check 默认配置）
- 所有 `forget()` 删除操作必须在单次 SQLite 事务中执行（原子性）
- 迁移 004、005、006 通过现有迁移框架自动执行，无需手动调用
