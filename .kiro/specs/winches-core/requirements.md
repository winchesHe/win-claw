# 需求文档 — @winches/core 工具注册表与内置工具

## 简介

`@winches/core` 是 winches-agent monorepo 中的核心工具层，提供工具注册表和所有内置工具的实现。该包定义统一的工具接口规范，实现工具注册与查询机制，并提供文件操作、浏览器控制、Shell 执行、网络请求、系统信息、剪贴板和定时任务等内置工具。工具接口与 `@winches/ai` 的 ToolDefinition 格式对齐，以支持 LLM tool calling。

Phase 2 实施范围：工具注册表 + 文件操作工具。其余工具（浏览器控制、Shell、网络请求、系统信息、剪贴板、定时任务）在 Phase 4 扩展中实现，但本文档覆盖完整接口设计以便后续扩展。

## 术语表

- **Core_Package**: `@winches/core` 包，工具注册表与内置工具的 TypeScript 实现
- **Tool**: 可被 Agent 调用的功能单元，包含名称、描述、参数 Schema、权限级别和执行函数
- **ToolRegistry**: 管理 Tool 实例的注册中心，支持注册、查询和按权限级别筛选
- **ToolResult**: 工具执行的结果对象，包含成功/失败状态和返回数据
- **DangerLevel**: 工具的权限级别，分为 safe（直接执行）、confirm（需用户确认）、dangerous（需明确批准）
- **JSONSchema**: 描述工具参数结构的 JSON Schema 对象，与 `@winches/ai` 的 ToolDefinition.parameters 格式一致
- **File_Tool**: 文件操作工具集，包含读取、写入、删除、列目录、移动五个工具
- **Browser_Tool**: 浏览器控制工具集，基于 Playwright 实现（Phase 4）
- **Shell_Tool**: Shell 命令执行工具（Phase 4）
- **Http_Tool**: HTTP 请求工具集（Phase 4）
- **System_Tool**: 系统信息查询工具集（Phase 4）
- **Clipboard_Tool**: 系统剪贴板读写工具集（Phase 4）
- **Scheduler_Tool**: 定时任务管理工具集（Phase 4）

## 需求

### 需求 1：工具接口定义

**用户故事：** 作为上层包（@winches/agent）的开发者，我希望有统一的工具接口定义，以便实现和调用各类工具。

#### 验收标准

1. THE Core_Package SHALL 导出 Tool 接口，包含 name（string）、description（string）、parameters（JSONSchema）、dangerLevel（DangerLevel）和 execute 方法字段
2. WHEN 调用 Tool 的 execute 方法时，THE Tool SHALL 接受 unknown 类型的参数，返回 Promise<ToolResult>
3. THE Core_Package SHALL 导出 ToolResult 类型，包含 success（boolean）字段；WHEN success 为 true 时包含 data（unknown）字段；WHEN success 为 false 时包含 error（string）字段
4. THE Core_Package SHALL 导出 DangerLevel 类型，取值为 "safe"、"confirm" 或 "dangerous" 之一
5. THE Core_Package SHALL 导出 JSONSchema 类型，与 `@winches/ai` 的 ToolDefinition.parameters 字段类型兼容

### 需求 2：工具注册表

**用户故事：** 作为 @winches/agent 的开发者，我希望通过统一的注册表管理所有工具，以便在 Agent 运行时动态查询和调用工具。

#### 验收标准

1. THE Core_Package SHALL 导出 ToolRegistry 类，实现工具的注册、查询和列举功能
2. WHEN 调用 ToolRegistry.register 方法时，THE ToolRegistry SHALL 将 Tool 实例存储到内部注册表中，以 tool.name 为键
3. IF 注册的工具名称已存在，THEN THE ToolRegistry SHALL 抛出包含重复工具名称的描述性错误
4. WHEN 调用 ToolRegistry.get 方法并传入已注册的工具名称时，THE ToolRegistry SHALL 返回对应的 Tool 实例
5. WHEN 调用 ToolRegistry.get 方法并传入未注册的工具名称时，THE ToolRegistry SHALL 返回 undefined
6. WHEN 调用 ToolRegistry.list 方法时，THE ToolRegistry SHALL 返回所有已注册 Tool 实例的数组
7. WHEN 调用 ToolRegistry.listByDangerLevel 方法并传入有效的 DangerLevel 时，THE ToolRegistry SHALL 返回所有匹配该权限级别的 Tool 实例数组
8. THE Core_Package SHALL 导出 createDefaultRegistry 工厂函数，返回预注册了所有内置工具的 ToolRegistry 实例

### 需求 3：工具与 LLM Tool Calling 格式对齐

**用户故事：** 作为 @winches/agent 的开发者，我希望工具定义能直接转换为 LLM tool calling 格式，以便无缝集成 AI 调用。

#### 验收标准

1. THE Core_Package SHALL 导出 toToolDefinition 函数，将 Tool 转换为 `@winches/ai` 的 ToolDefinition 格式
2. WHEN 调用 toToolDefinition 时，THE Core_Package SHALL 将 Tool.name 映射到 ToolDefinition.name，Tool.description 映射到 ToolDefinition.description，Tool.parameters 映射到 ToolDefinition.parameters
3. THE Core_Package SHALL 导出 registryToToolDefinitions 函数，将 ToolRegistry 中的所有工具批量转换为 ToolDefinition 数组

### 需求 4：file.read — 读取文件内容

**用户故事：** 作为 Agent，我希望能读取本地文件内容，以便处理用户的文件相关请求。

#### 验收标准

1. THE File_Tool SHALL 提供名称为 "file.read" 的工具，dangerLevel 为 "safe"
2. WHEN 调用 file.read 并传入有效的 filePath 参数时，THE File_Tool SHALL 读取该路径的文件内容并在 ToolResult.data 中返回文件内容字符串
3. WHEN 调用 file.read 并传入可选的 encoding 参数时，THE File_Tool SHALL 使用指定编码读取文件（默认为 "utf-8"）
4. IF 指定路径的文件不存在，THEN THE File_Tool SHALL 返回 success 为 false 且 error 包含文件路径的 ToolResult
5. IF 读取文件时发生权限错误，THEN THE File_Tool SHALL 返回 success 为 false 且 error 包含错误描述的 ToolResult

### 需求 5：file.write — 写入文件

**用户故事：** 作为 Agent，我希望能写入本地文件，以便完成文件创建和修改任务。

#### 验收标准

1. THE File_Tool SHALL 提供名称为 "file.write" 的工具，dangerLevel 为 "confirm"
2. WHEN 调用 file.write 并传入有效的 filePath 和 content 参数时，THE File_Tool SHALL 将 content 写入指定路径的文件
3. WHEN 目标文件的父目录不存在时，THE File_Tool SHALL 递归创建所需的目录结构后再写入文件
4. WHEN 目标文件已存在时，THE File_Tool SHALL 覆盖原有内容并返回 success 为 true 的 ToolResult
5. IF 写入文件时发生权限错误，THEN THE File_Tool SHALL 返回 success 为 false 且 error 包含错误描述的 ToolResult

### 需求 6：file.delete — 删除文件

**用户故事：** 作为 Agent，我希望能删除本地文件，以便完成文件清理任务。

#### 验收标准

1. THE File_Tool SHALL 提供名称为 "file.delete" 的工具，dangerLevel 为 "dangerous"
2. WHEN 调用 file.delete 并传入有效的 filePath 参数时，THE File_Tool SHALL 删除指定路径的文件并返回 success 为 true 的 ToolResult
3. IF 指定路径的文件不存在，THEN THE File_Tool SHALL 返回 success 为 false 且 error 包含文件路径的 ToolResult
4. IF 删除文件时发生权限错误，THEN THE File_Tool SHALL 返回 success 为 false 且 error 包含错误描述的 ToolResult

### 需求 7：file.list — 列出目录内容

**用户故事：** 作为 Agent，我希望能列出目录内容，以便了解文件系统结构。

#### 验收标准

1. THE File_Tool SHALL 提供名称为 "file.list" 的工具，dangerLevel 为 "safe"
2. WHEN 调用 file.list 并传入有效的 dirPath 参数时，THE File_Tool SHALL 返回该目录下所有条目的列表，每个条目包含 name（string）、type（"file" 或 "directory"）和 size（number，字节数）字段
3. WHEN 调用 file.list 并传入可选的 recursive 参数为 true 时，THE File_Tool SHALL 递归列出所有子目录内容
4. IF 指定路径不存在或不是目录，THEN THE File_Tool SHALL 返回 success 为 false 且 error 包含路径信息的 ToolResult

### 需求 8：file.move — 移动或重命名文件

**用户故事：** 作为 Agent，我希望能移动或重命名文件，以便完成文件整理任务。

#### 验收标准

1. THE File_Tool SHALL 提供名称为 "file.move" 的工具，dangerLevel 为 "confirm"
2. WHEN 调用 file.move 并传入有效的 sourcePath 和 destPath 参数时，THE File_Tool SHALL 将文件从 sourcePath 移动到 destPath 并返回 success 为 true 的 ToolResult
3. WHEN 目标路径的父目录不存在时，THE File_Tool SHALL 递归创建所需的目录结构后再移动文件
4. IF 源文件不存在，THEN THE File_Tool SHALL 返回 success 为 false 且 error 包含源路径信息的 ToolResult
5. IF 移动文件时发生权限错误，THEN THE File_Tool SHALL 返回 success 为 false 且 error 包含错误描述的 ToolResult

### 需求 9：browser 工具集接口（Phase 4）

**用户故事：** 作为 Agent，我希望能控制浏览器执行网页操作，以便完成 AI 驱动的浏览器自动化任务。

#### 验收标准

1. THE Core_Package SHALL 为以下浏览器工具预留接口定义：browser.open（safe）、browser.screenshot（safe）、browser.click（confirm）、browser.type（confirm）、browser.evaluate（confirm）、browser.navigate（confirm）
2. WHEN 实现 Browser_Tool 时，THE Browser_Tool SHALL 基于 Playwright 实现浏览器控制功能
3. WHEN 调用 browser.open 并传入有效的 url 参数时，THE Browser_Tool SHALL 在受控浏览器中打开指定 URL
4. WHEN 调用 browser.screenshot 时，THE Browser_Tool SHALL 截取当前页面并在 ToolResult.data 中返回图片数据（base64 编码）
5. WHEN 调用 browser.navigate 并传入 goal 参数时，THE Browser_Tool SHALL 以 AI 驱动方式自主浏览以完成指定目标

### 需求 10：shell.exec — Shell 命令执行（Phase 4）

**用户故事：** 作为 Agent，我希望能执行 Shell 命令，以便完成系统级操作任务。

#### 验收标准

1. THE Core_Package SHALL 为 shell.exec 工具预留接口定义，dangerLevel 为 "dangerous"
2. WHEN 实现 Shell_Tool 时，WHEN 调用 shell.exec 并传入有效的 command 参数时，THE Shell_Tool SHALL 执行该命令并在 ToolResult.data 中返回包含 stdout、stderr 和 exitCode 的结果对象
3. WHEN 调用 shell.exec 并传入可选的 timeout 参数时，THE Shell_Tool SHALL 在超时后终止命令执行并返回超时错误

### 需求 11：http 工具集接口（Phase 4）

**用户故事：** 作为 Agent，我希望能发起 HTTP 请求，以便与外部 API 和服务交互。

#### 验收标准

1. THE Core_Package SHALL 为以下 HTTP 工具预留接口定义：http.get（safe）、http.post（confirm）
2. WHEN 实现 Http_Tool 时，WHEN 调用 http.get 并传入有效的 url 参数时，THE Http_Tool SHALL 发起 GET 请求并在 ToolResult.data 中返回包含 status、headers 和 body 的响应对象
3. WHEN 实现 Http_Tool 时，WHEN 调用 http.post 并传入有效的 url 和 body 参数时，THE Http_Tool SHALL 发起 POST 请求并在 ToolResult.data 中返回响应对象

### 需求 12：system 工具集接口（Phase 4）

**用户故事：** 作为 Agent，我希望能查询系统状态信息，以便监控运行环境。

#### 验收标准

1. THE Core_Package SHALL 为以下系统工具预留接口定义：system.info（safe）、system.processes（safe）
2. WHEN 实现 System_Tool 时，WHEN 调用 system.info 时，THE System_Tool SHALL 在 ToolResult.data 中返回包含 CPU 使用率、内存使用量和磁盘使用量的系统状态对象
3. WHEN 实现 System_Tool 时，WHEN 调用 system.processes 时，THE System_Tool SHALL 在 ToolResult.data 中返回当前运行进程的列表

### 需求 13：clipboard 工具集接口（Phase 4）

**用户故事：** 作为 Agent，我希望能读写系统剪贴板，以便与用户的复制粘贴操作协作。

#### 验收标准

1. THE Core_Package SHALL 为以下剪贴板工具预留接口定义：clipboard.read（safe）、clipboard.write（confirm）
2. WHEN 实现 Clipboard_Tool 时，WHEN 调用 clipboard.read 时，THE Clipboard_Tool SHALL 在 ToolResult.data 中返回当前剪贴板的文本内容
3. WHEN 实现 Clipboard_Tool 时，WHEN 调用 clipboard.write 并传入有效的 text 参数时，THE Clipboard_Tool SHALL 将指定文本写入系统剪贴板

### 需求 14：scheduler 工具集接口（Phase 4）

**用户故事：** 作为 Agent，我希望能管理定时任务，以便在指定时间执行提醒或操作。

#### 验收标准

1. THE Core_Package SHALL 为以下定时任务工具预留接口定义：scheduler.set（confirm）、scheduler.list（safe）、scheduler.cancel（safe）
2. WHEN 实现 Scheduler_Tool 时，WHEN 调用 scheduler.set 并传入有效的 cronExpression 和 action 参数时，THE Scheduler_Tool SHALL 创建定时任务并返回包含任务 ID 的 ToolResult
3. WHEN 实现 Scheduler_Tool 时，WHEN 调用 scheduler.list 时，THE Scheduler_Tool SHALL 在 ToolResult.data 中返回所有活跃定时任务的列表
4. WHEN 实现 Scheduler_Tool 时，WHEN 调用 scheduler.cancel 并传入有效的 taskId 参数时，THE Scheduler_Tool SHALL 取消对应的定时任务
5. IF 实现 Scheduler_Tool 时，WHEN 调用 scheduler.cancel 并传入不存在的 taskId 时，THEN THE Scheduler_Tool SHALL 返回 success 为 false 且 error 包含任务 ID 的 ToolResult
