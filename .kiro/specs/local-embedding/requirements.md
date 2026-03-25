# 需求文档

## 简介

将 `@winches/storage` 包中的 `EmbeddingService` 从远程 OpenAI API 调用改为本地 ONNX 模型推理。使用 `@huggingface/transformers` 库在 Node.js 进程内直接加载并运行 embedding 模型，消除对任何外部 API 或服务（如 OpenAI、Ollama）的依赖。首次运行时自动从 HuggingFace Hub 下载模型并缓存到本地，后续运行纯离线完成。

## 术语表

- **EmbeddingService**: `@winches/storage` 包中负责将文本转换为向量（number[]）的服务类
- **StorageConfig**: Storage 包的配置类型，定义在 `packages/storage/src/types.ts`
- **StorageConfigLoader**: 从 YAML 文件和环境变量加载 StorageConfig 的配置加载器
- **SqliteStorageService**: 基于 SQLite 的存储服务实现，依赖 EmbeddingService 进行 remember/recall 操作
- **ONNX_Model**: 由 @huggingface/transformers 加载的本地 ONNX 格式 embedding 模型
- **Model_Cache**: 模型文件在本地磁盘上的缓存目录，避免重复下载
- **Pipeline**: @huggingface/transformers 提供的高级推理接口，封装了 tokenizer + 模型推理 + 后处理

## 需求

### 需求 1：本地 Embedding 推理

**用户故事：** 作为开发者，我希望 EmbeddingService 在 Node.js 进程内使用本地 ONNX 模型计算 embedding 向量，以便不依赖任何外部 API 服务。

#### 验收标准

1. WHEN 调用 EmbeddingService.embed(text) 时，THE EmbeddingService SHALL 使用 @huggingface/transformers 的 feature-extraction pipeline 在本地计算 embedding 向量并返回 number[]
2. THE EmbeddingService SHALL 使用 `Xenova/all-MiniLM-L6-v2` 作为默认 embedding 模型
3. THE EmbeddingService SHALL 对 pipeline 实例进行懒加载，仅在首次调用 embed() 时初始化模型
4. WHEN pipeline 初始化完成后，THE EmbeddingService SHALL 复用同一 pipeline 实例处理后续所有 embed 请求
5. WHEN 输入文本为空字符串时，THE EmbeddingService SHALL 返回一个全零向量，维度与模型输出一致

### 需求 2：模型自动下载与本地缓存

**用户故事：** 作为开发者，我希望首次运行时自动从 HuggingFace Hub 下载模型并缓存到本地，之后无需网络即可运行。

#### 验收标准

1. WHEN 本地缓存中不存在所需模型文件时，THE EmbeddingService SHALL 自动从 HuggingFace Hub 下载模型文件
2. WHEN 模型文件已存在于本地缓存中时，THE EmbeddingService SHALL 直接从缓存加载模型，不发起任何网络请求
3. THE EmbeddingService SHALL 使用 @huggingface/transformers 库的默认缓存机制存储模型文件
4. IF 模型下载失败（如网络不可用且本地无缓存），THEN THE EmbeddingService SHALL 抛出 EmbeddingError 并包含描述性错误信息

### 需求 3：配置简化

**用户故事：** 作为开发者，我希望使用本地 embedding 时不再需要配置 API Key 和 Base URL，以便简化部署流程。

#### 验收标准

1. WHEN embedding.provider 配置为 "local" 时，THE StorageConfigLoader SHALL 跳过对 embedding.apiKey 字段的必填校验
2. WHEN embedding.provider 配置为 "local" 时，THE StorageConfigLoader SHALL 跳过对 embedding.baseUrl 字段的解析
3. THE StorageConfig 类型 SHALL 将 embedding.apiKey 字段标记为可选（仅 provider 非 "local" 时必填）
4. WHERE embedding.provider 配置为 "local"，THE StorageConfigLoader SHALL 仅要求 provider 和 model 两个字段
5. WHEN embedding.provider 配置为非 "local" 值时，THE StorageConfigLoader SHALL 保持现有的 apiKey 必填校验逻辑不变

### 需求 4：向后兼容

**用户故事：** 作为开发者，我希望现有的远程 API embedding 方式仍然可用，以便在需要时可以切换回远程模式。

#### 验收标准

1. WHEN embedding.provider 配置为 "openai" 或其他非 "local" 值时，THE EmbeddingService SHALL 继续通过 HTTP 调用远程 /v1/embeddings API
2. THE EmbeddingService SHALL 保持 embed(text: string): Promise<number[]> 的公共接口签名不变
3. THE SqliteStorageService SHALL 无需修改即可与新的本地 EmbeddingService 协同工作
4. THE memories 表的 vector 列 SHALL 继续存储 JSON 序列化的 number[]，格式不变

### 需求 5：依赖管理

**用户故事：** 作为开发者，我希望 @huggingface/transformers 作为 @winches/storage 包的依赖被正确管理。

#### 验收标准

1. THE @winches/storage 包 SHALL 将 @huggingface/transformers 添加为 dependencies
2. THE @winches/storage 包 SHALL 移除对 @winches/ai 包的依赖（当前仅用于 embedding API 调用的类型）
3. IF @winches/ai 包的类型仍被 storage 包的其他模块引用，THEN THE @winches/storage 包 SHALL 保留 @winches/ai 依赖

### 需求 6：错误处理

**用户故事：** 作为开发者，我希望本地推理过程中的错误能被正确捕获并转换为 EmbeddingError。

#### 验收标准

1. IF 模型加载过程中发生错误，THEN THE EmbeddingService SHALL 抛出 EmbeddingError 并包含原始错误作为 cause
2. IF 推理过程中发生错误（如内存不足），THEN THE EmbeddingService SHALL 抛出 EmbeddingError 并包含描述性错误信息
3. IF pipeline 初始化失败，THEN THE EmbeddingService SHALL 在下次调用 embed() 时重新尝试初始化，而非缓存失败状态
