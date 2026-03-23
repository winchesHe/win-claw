# 实现计划：@winches/core 工具注册表与内置工具

## 概述

基于需求文档和技术设计，将 `@winches/core` 包的实现拆分为增量式编码任务。从核心类型定义开始，逐步实现注册表、适配器、文件工具和 Phase 4 stub，最终通过 `index.ts` 统一导出并配置依赖。

## 任务

- [x] 1. 配置 package.json 依赖
  - 在 `packages/core/package.json` 中添加 `pino` 为 dependencies
  - 添加 `@winches/ai` 为 dependencies（用于 ToolDefinition 类型引用）
  - 添加 `fast-check` 和 `@types/node` 为 devDependencies
  - _需求: 1.1, 3.1_

- [x] 2. 定义核心类型与错误类型
  - [x] 2.1 创建 `packages/core/src/types.ts`，定义所有核心类型
    - 定义 `DangerLevel` 类型（"safe" | "confirm" | "dangerous"）
    - 定义 `JSONSchema` 类型（Record<string, unknown>）
    - 定义 `Tool` 接口（name、description、parameters、dangerLevel、execute）
    - 定义 `ToolResult` 判别联合类型（success: true + data，或 success: false + error）
    - 定义 `FileEntry` 接口（name、type、size）
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 7.2_

  - [x] 2.2 创建 `packages/core/src/errors.ts`，定义自定义错误类型
    - 实现 `CoreError`（基础错误类，设置 name 字段）
    - 实现 `DuplicateToolError`（包含 toolName 字段，错误消息含工具名称）
    - 实现 `ToolParamError`（包含 toolName 字段，工具内部使用）
    - _需求: 2.3_

- [x] 3. 实现 ToolRegistry
  - [x] 3.1 创建 `packages/core/src/registry.ts`，实现 ToolRegistry 类
    - 使用 `Map<string, Tool>` 作为内部存储
    - 实现 `register` 方法（重复名称抛出 DuplicateToolError）
    - 实现 `get` 方法（未注册返回 undefined）
    - 实现 `list` 方法（返回所有工具数组）
    - 实现 `listByDangerLevel` 方法（按权限级别过滤）
    - 导出空的 `createDefaultRegistry` 占位函数（后续任务补全）
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 3.2 编写 Property 3 属性测试：工具注册 round-trip
    - **Property 3: 工具注册 round-trip**
    - **验证: 需求 2.2, 2.4**

  - [ ]* 3.3 编写 Property 4 属性测试：重复注册抛出包含工具名称的错误
    - **Property 4: 重复注册抛出包含工具名称的错误**
    - **验证: 需求 2.3**

  - [ ]* 3.4 编写 Property 5 属性测试：未注册工具查询返回 undefined
    - **Property 5: 未注册工具查询返回 undefined**
    - **验证: 需求 2.5**

  - [ ]* 3.5 编写 Property 6 属性测试：list 返回所有已注册工具
    - **Property 6: list 返回所有已注册工具**
    - **验证: 需求 2.6**

  - [ ]* 3.6 编写 Property 7 属性测试：listByDangerLevel 过滤正确性
    - **Property 7: listByDangerLevel 过滤正确性**
    - **验证: 需求 2.7**

- [x] 4. 实现适配器函数
  - [x] 4.1 创建 `packages/core/src/adapters.ts`，实现工具格式转换函数
    - 从 `@winches/ai` 导入 `ToolDefinition` 类型
    - 实现 `toToolDefinition(tool: Tool): ToolDefinition`（映射 name、description、parameters）
    - 实现 `registryToToolDefinitions(registry: ToolRegistry): ToolDefinition[]`（批量转换）
    - _需求: 3.1, 3.2, 3.3_

  - [ ]* 4.2 编写 Property 8 属性测试：toToolDefinition 字段映射保留语义
    - **Property 8: toToolDefinition 字段映射保留语义**
    - **验证: 需求 3.2**

  - [ ]* 4.3 编写 Property 9 属性测试：registryToToolDefinitions 批量转换完整性
    - **Property 9: registryToToolDefinitions 批量转换完整性**
    - **验证: 需求 3.3**

- [x] 5. 检查点 — 确保核心层测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 6. 实现文件操作工具
  - [x] 6.1 创建 `packages/core/src/tools/file.ts`，实现五个文件工具
    - 实现 `fileReadTool`（file.read，safe）：使用 `fs/promises` 读取文件，支持 encoding 参数，捕获 ENOENT 和权限错误
    - 实现 `fileWriteTool`（file.write，confirm）：写入前调用 `fs.mkdir({ recursive: true })` 创建目录，覆盖已有文件
    - 实现 `fileDeleteTool`（file.delete，dangerous）：删除文件，捕获 ENOENT 和权限错误
    - 实现 `fileListTool`（file.list，safe）：列出目录条目，支持 recursive 参数，返回 FileEntry 数组
    - 实现 `fileMoveTool`（file.move，confirm）：移动前创建目标目录，捕获源不存在和权限错误
    - 导出 `fileTools: Tool[]` 数组（包含以上五个工具）
    - _需求: 4.1–4.5, 5.1–5.5, 6.1–6.4, 7.1–7.4, 8.1–8.5_

  - [ ]* 6.2 编写 Property 10 属性测试：file.write / file.read round-trip
    - **Property 10: file.write / file.read round-trip**
    - **验证: 需求 4.2, 5.2**

  - [ ]* 6.3 编写 Property 11 属性测试：文件操作对不存在路径返回描述性错误
    - **Property 11: 文件操作对不存在路径返回描述性错误**
    - **验证: 需求 4.4, 6.3, 7.4, 8.4**

  - [ ]* 6.4 编写 Property 12 属性测试：file.delete 删除后文件不可读
    - **Property 12: file.delete 删除后文件不可读**
    - **验证: 需求 6.2**

  - [ ]* 6.5 编写 Property 13 属性测试：file.move 移动后源不存在、目标内容一致
    - **Property 13: file.move 移动后源不存在、目标内容一致**
    - **验证: 需求 8.2**

  - [ ]* 6.6 编写 Property 14 属性测试：file.list 条目结构完整性
    - **Property 14: file.list 条目结构完整性**
    - **验证: 需求 7.2**

- [x] 7. 检查点 — 确保文件工具测试通过
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 8. 实现 Phase 4 工具 Stub
  - [x] 8.1 创建 `packages/core/src/tools/browser.ts`，导出 `browserTools: Tool[]`
    - 包含 browser.open（safe）、browser.screenshot（safe）、browser.click（confirm）、browser.type（confirm）、browser.evaluate（confirm）、browser.navigate（confirm）
    - 所有 execute 方法返回 `{ success: false, error: "Not implemented (Phase 4)" }`
    - _需求: 9.1_

  - [x] 8.2 创建 `packages/core/src/tools/shell.ts`，导出 `shellTools: Tool[]`
    - 包含 shell.exec（dangerous）
    - execute 方法返回 `{ success: false, error: "Not implemented (Phase 4)" }`
    - _需求: 10.1_

  - [x] 8.3 创建 `packages/core/src/tools/http.ts`，导出 `httpTools: Tool[]`
    - 包含 http.get（safe）、http.post（confirm）
    - execute 方法返回 `{ success: false, error: "Not implemented (Phase 4)" }`
    - _需求: 11.1_

  - [x] 8.4 创建 `packages/core/src/tools/system.ts`，导出 `systemTools: Tool[]`
    - 包含 system.info（safe）、system.processes（safe）
    - execute 方法返回 `{ success: false, error: "Not implemented (Phase 4)" }`
    - _需求: 12.1_

  - [x] 8.5 创建 `packages/core/src/tools/clipboard.ts`，导出 `clipboardTools: Tool[]`
    - 包含 clipboard.read（safe）、clipboard.write（confirm）
    - execute 方法返回 `{ success: false, error: "Not implemented (Phase 4)" }`
    - _需求: 13.1_

  - [x] 8.6 创建 `packages/core/src/tools/scheduler.ts`，导出 `schedulerTools: Tool[]`
    - 包含 scheduler.set（confirm）、scheduler.list（safe）、scheduler.cancel（safe）
    - execute 方法返回 `{ success: false, error: "Not implemented (Phase 4)" }`
    - _需求: 14.1_

  - [ ]* 8.7 编写 stub 工具单元测试（`__tests__/tools/stubs.test.ts`）
    - 验证所有 Phase 4 stub 工具的 execute 返回 `success: false` 且 error 包含 "Not implemented"
    - 验证所有 stub 工具的 dangerLevel 字段合法
    - _需求: 9.1, 10.1, 11.1, 12.1, 13.1, 14.1_

- [x] 9. 完善 createDefaultRegistry 并统一导出
  - [x] 9.1 更新 `packages/core/src/registry.ts`，实现完整的 `createDefaultRegistry`
    - 导入所有工具数组（fileTools、browserTools、shellTools、httpTools、systemTools、clipboardTools、schedulerTools）
    - 注册所有工具到新 ToolRegistry 实例
    - 使用 pino 记录初始化完成日志（info 级别，包含注册工具数量）
    - _需求: 2.8_

  - [ ]* 9.2 编写 Property 1 属性测试：工具 execute 返回合法 ToolResult 结构
    - **Property 1: 工具 execute 返回合法 ToolResult 结构**
    - **验证: 需求 1.2, 1.3**

  - [ ]* 9.3 编写 Property 2 属性测试：所有已注册工具的 dangerLevel 合法
    - **Property 2: 所有已注册工具的 dangerLevel 合法**
    - **验证: 需求 1.4**

  - [x] 9.4 更新 `packages/core/src/index.ts`，导出所有公共 API
    - 导出所有类型（Tool、ToolResult、DangerLevel、JSONSchema、FileEntry）
    - 导出 ToolRegistry 类和 createDefaultRegistry 工厂函数
    - 导出适配器函数（toToolDefinition、registryToToolDefinitions）
    - 导出错误类型（CoreError、DuplicateToolError、ToolParamError）
    - _需求: 1.1–1.5, 2.1, 2.8, 3.1, 3.3_

- [x] 10. 最终检查点 — 确保所有测试通过并完成构建验证
  - 确保所有测试通过，如有疑问请向用户确认。
  - 运行 `tsdown` 构建，确认类型声明和产物正确生成。

## 备注

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP 开发
- 文件操作属性测试使用 `os.tmpdir()` 临时目录，测试后清理，不 mock `fs/promises`
- pino 日志在测试中通过 `pino({ level: 'silent' })` 静默
- Phase 4 stub 工具保持接口稳定，Phase 4 实现时直接替换 execute 方法即可
- 每个任务引用了具体的需求编号，确保可追溯性
