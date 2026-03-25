# 实现计划：本地 Embedding 推理

## 概述

将 `@winches/storage` 包的 `EmbeddingService` 改造为策略模式双 Provider 架构，支持本地 ONNX 模型推理和远程 API 调用两种模式。按照依赖顺序逐步实现：类型变更 → 配置校验 → Provider 拆分 → 集成串联 → 测试覆盖。

## 任务

- [x] 1. 修改类型定义与添加依赖
  - [x] 1.1 修改 `StorageConfig` 类型，将 `embedding.apiKey` 改为可选字段
    - 修改 `packages/storage/src/types.ts` 中 `StorageConfig.embedding.apiKey` 类型为 `apiKey?: string`
    - _需求：3.3_
  - [x] 1.2 在 `@winches/storage` 的 `package.json` 中添加 `@huggingface/transformers` 依赖
    - 修改 `packages/storage/package.json`，在 `dependencies` 中添加 `@huggingface/transformers`
    - _需求：5.1_

- [x] 2. 修改 `StorageConfigLoader` 配置校验逻辑
  - [x] 2.1 修改 `validate()` 方法，对 `provider === "local"` 跳过 `apiKey` 必填校验
    - 修改 `packages/storage/src/config.ts` 中 `StorageConfigLoader.validate()` 方法
    - 当 `embedding.provider !== "local"` 时才校验 `apiKey`
    - _需求：3.1, 3.2, 3.4, 3.5_
  - [ ]* 2.2 编写属性测试：Local Provider 配置仅需 provider 和 model
    - **属性 3：Local Provider 配置仅需 provider 和 model**
    - **验证需求：3.1, 3.2, 3.4**
  - [ ]* 2.3 编写属性测试：非 Local Provider 必须提供 apiKey
    - **属性 4：非 Local Provider 必须提供 apiKey**
    - **验证需求：3.5**
  - [ ]* 2.4 编写 `StorageConfigLoader` 单元测试
    - 测试 `provider="local"` 时无 apiKey 通过校验
    - 测试 `provider="openai"` 时无 apiKey 抛出 `ConfigError`
    - 测试缺少 provider 或 model 时抛出 `ConfigError`
    - _需求：3.1, 3.2, 3.4, 3.5_

- [x] 3. 检查点 - 确保类型和配置变更正确
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 4. 实现策略模式 Provider 拆分
  - [x] 4.1 定义 `EmbeddingProvider` 内部接口，实现 `RemoteEmbeddingProvider`
    - 在 `packages/storage/src/embedding.ts` 中定义 `EmbeddingProvider` 接口（`embed(text: string): Promise<number[]>`）
    - 将现有 `EmbeddingService` 的 HTTP 调用逻辑提取为 `RemoteEmbeddingProvider` 类
    - _需求：4.1, 4.2_
  - [x] 4.2 实现 `LocalEmbeddingProvider`
    - 在 `packages/storage/src/embedding.ts` 中新增 `LocalEmbeddingProvider` 类
    - 使用 `@huggingface/transformers` 的 `pipeline("feature-extraction", model)` 进行本地推理
    - 实现 pipeline 懒加载：首次调用 `embed()` 时初始化，通过 `pipelinePromise` 保证并发安全
    - 实现失败重试：初始化失败时重置 `pipelinePromise` 为 `null`
    - 空字符串输入返回 384 维全零向量
    - 错误统一包装为 `EmbeddingError`，保留原始 `cause`
    - _需求：1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 6.1, 6.2, 6.3_
  - [x] 4.3 重构 `EmbeddingService` 为门面类
    - 修改 `EmbeddingService` 构造函数，根据 `config.provider` 选择 `LocalEmbeddingProvider` 或 `RemoteEmbeddingProvider`
    - `embed()` 方法委托给内部 provider
    - 保持公共接口 `embed(text: string): Promise<number[]>` 不变
    - _需求：4.2, 4.3_

- [x] 5. 检查点 - 确保 Provider 拆分正确
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 6. 编写 LocalEmbeddingProvider 测试
  - [ ]* 6.1 编写属性测试：Embed 输出维度一致性
    - **属性 1：Embed 输出维度一致性**
    - mock `@huggingface/transformers` 的 `pipeline` 函数，返回固定 384 维向量
    - 使用 `fc.string({ minLength: 1 })` 生成随机非空字符串
    - **验证需求：1.1**
  - [ ]* 6.2 编写属性测试：Pipeline 单例复用
    - **属性 2：Pipeline 单例复用**
    - mock pipeline 工厂函数，验证多次调用 `embed()` 后 pipeline 只初始化一次
    - **验证需求：1.4**
  - [ ]* 6.3 编写属性测试：错误统一包装为 EmbeddingError
    - **属性 6：错误统一包装为 EmbeddingError**
    - mock pipeline 抛出随机错误，验证被包装为 `EmbeddingError` 且 `cause` 正确
    - **验证需求：6.1, 6.2**
  - [ ]* 6.4 编写属性测试：Pipeline 初始化失败后允许重试
    - **属性 7：Pipeline 初始化失败后允许重试**
    - mock pipeline 首次失败、第二次成功，验证重试行为
    - **验证需求：6.3**
  - [ ]* 6.5 编写属性测试：向量存储 Round-Trip
    - **属性 5：向量存储 Round-Trip**
    - 使用 `fc.array(fc.float({ noNaN: true }))` 生成随机向量
    - 验证 JSON 序列化/反序列化后数值相等
    - **验证需求：4.4**
  - [ ]* 6.6 编写 LocalEmbeddingProvider 单元测试
    - 测试空字符串输入返回 384 维全零向量
    - 测试构造后未调用 embed 时 pipeline 未初始化
    - 测试模型下载失败时抛出 EmbeddingError
    - 测试 provider="local" 时构造 LocalEmbeddingProvider
    - 测试 provider="openai" 时构造 RemoteEmbeddingProvider
    - _需求：1.2, 1.3, 1.5, 2.4, 4.1_

- [x] 7. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 标记 `*` 的子任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 属性测试使用 `fast-check` 库，验证设计文档中的 7 个正确性属性
- 所有本地推理测试需 mock `@huggingface/transformers`，避免实际加载模型
- 属性 5（向量 round-trip）为纯数据测试，不需要 mock
- 测试文件放置在 `packages/storage/src/__tests__/` 目录下
