# 实现计划：MCP/Skills 集成

## 概述

将 MCP 服务器和 Skills 插件集成能力分步实现到 `@winches/core` 和 `@winches/agent` 中。按照自底向上的顺序：先建立数据模型和类型定义，再实现配置验证、配置发现、MCP 客户端管理、工具适配、Skill 注册，最后实现 Slash Command 处理并将所有组件串联到 Agent 中。

## Tasks

- [x] 1. 定义插件类型系统和错误类
  - [x] 1.1 创建 `packages/core/src/plugin/types.ts`，定义所有插件相关类型
    - 定义 `IdeType`、`ConfigSource`、`McpServerConfig`、`SkillConfig`、`PluginConfig`、`Skill`、`McpServerStatus`、`ValidationError` 等类型
    - _需求: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 9.1_
  - [x] 1.2 创建 `packages/core/src/plugin/errors.ts`，定义插件错误类
    - 定义 `PluginError`（继承 `CoreError`）、`PluginConfigValidationError`（携带 `errors: ValidationError[]`）、`McpConnectionError`（携带 `serverName`）
    - _需求: 8.1, 8.2, 8.5_

- [x] 2. 实现 ConfigValidator — 配置验证器
  - [x] 2.1 创建 `packages/core/src/plugin/config-validator.ts`，实现 `validatePluginConfig` 函数
    - 验证 MCP Server 必填字段（name、transport；stdio 需 command；sse 需 url）
    - 验证 Skill name 格式（仅允许 `[a-z0-9-]`）
    - 验证 prompt/promptFile 互斥
    - 验证 promptFile 文件存在性
    - 检测重复 Skill name
    - 收集所有错误后批量返回
    - _需求: 2.2, 2.3, 2.4, 5.2, 5.4, 5.5, 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 2.2 编写属性测试：MCP Server 配置验证与描述性错误
    - **Property 2: MCP Server 配置验证与描述性错误**
    - 使用 fast-check 生成随机缺失字段的 MCP 配置，验证错误信息包含字段名、服务器名和来源路径
    - **验证: 需求 2.2, 2.3, 2.4, 8.2**
  - [ ]* 2.3 编写属性测试：Skill 名称格式验证
    - **Property 6: Skill 名称格式验证**
    - 使用 fast-check 生成包含非法字符的随机字符串，验证验证器拒绝并返回正确错误信息
    - **验证: 需求 5.2, 8.3**
  - [ ]* 2.4 编写属性测试：prompt/promptFile 互斥验证
    - **Property 7: Skill prompt/promptFile 互斥验证**
    - 使用 fast-check 生成同时包含两个字段的配置，验证返回描述性错误
    - **验证: 需求 5.4**
  - [ ]* 2.5 编写属性测试：重复 Skill 名称检测
    - **Property 8: 重复 Skill 名称检测**
    - 使用 fast-check 生成包含重复名称的 Skill 列表，验证返回包含重复名称的错误
    - **验证: 需求 5.5**
  - [ ]* 2.6 编写属性测试：批量错误报告
    - **Property 13: 批量错误报告**
    - 使用 fast-check 生成包含 N 个验证错误的配置（N ≥ 2），验证一次性返回所有 N 个错误
    - **验证: 需求 8.5**

- [x] 3. 实现 ConfigDiscovery — 配置发现引擎
  - [x] 3.1 创建 `packages/core/src/plugin/config-discovery.ts`，实现 `discoverPluginConfig` 函数
    - 按优先级扫描 IDE 配置目录：项目本地 `.cursor` > `.claude` > `.codex` > `.kiro` > 全局同序 > `config.yaml`
    - 解析各 IDE 目录下的 `mcp.json` 和 `skills/` 目录（Markdown frontmatter 格式）
    - 解析 `config.yaml` 中的 `mcp.servers` 和 `skills` 字段
    - 实现同一 IDE 项目本地存在时忽略该 IDE 全局配置的逻辑
    - 实现同名 MCP Server / Skill 的优先级覆盖合并
    - 实现 `${ENV_VAR}` 环境变量替换
    - 空配置时返回空 PluginConfig 不报错
    - 记录 info 级别日志说明配置来源摘要
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.5, 2.6_
  - [ ]* 3.2 编写属性测试：配置合并优先级
    - **Property 1: 配置合并优先级**
    - 使用 fast-check 生成随机 MCP/Skill 名称和多个 ConfigSource，验证合并结果保留最高优先级来源
    - **验证: 需求 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.6**
  - [ ]* 3.3 编写属性测试：环境变量替换
    - **Property 3: 环境变量替换**
    - 使用 fast-check 生成随机变量名和值，验证替换后不再包含 `${VAR_NAME}` 占位符
    - **验证: 需求 2.5**

- [x] 4. 检查点 — 确保配置层测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 5. 实现 McpToolAdapter — MCP 工具适配器
  - [x] 5.1 创建 `packages/core/src/plugin/mcp-tool-adapter.ts`，实现 `adaptMcpTools` 函数
    - 将 MCP 工具转换为 `@winches/core` Tool 接口
    - 名称格式：`mcp.{serverName}.{toolName}`
    - 所有 MCP 工具 `dangerLevel` 默认为 `safe`
    - `execute` 方法通过 `callTool` 回调转发调用请求
    - MCP Server 错误转换为 `{ success: false, error: string }`
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [ ]* 5.2 编写属性测试：MCP 工具适配不变量
    - **Property 4: MCP 工具适配不变量**
    - 使用 fast-check 生成随机 server 名和工具定义，验证适配后名称格式、dangerLevel（safe）和字段一致性
    - **验证: 需求 4.1, 4.2, 4.3, 4.6**
  - [ ]* 5.3 编写属性测试：MCP 工具调用转发与错误处理
    - **Property 5: MCP 工具调用转发与错误处理**
    - 使用 fast-check 生成随机调用参数和 mock 响应，验证转发行为和错误处理
    - **验证: 需求 4.4, 4.5**

- [x] 6. 实现 McpClientManager — MCP 客户端管理器
  - [x] 6.1 创建 `packages/core/src/plugin/mcp-client-manager.ts`，实现 `McpClientManager` 类
    - 安装 `@modelcontextprotocol/sdk` 依赖到 `@winches/core`
    - 实现 `connectAll(servers, registry)` 方法：逐一连接 MCP Server，单个失败不影响其余
    - 支持 stdio 传输（`StdioClientTransport`）和 SSE 传输（`SSEClientTransport`）
    - 连接成功后调用 `tools/list` 发现工具，通过 McpToolAdapter 注入 ToolRegistry
    - 实现 `getStatus()` 返回所有 Server 连接状态
    - 实现 `disconnectAll()` 关闭所有连接并终止子进程
    - 连接失败时记录 warn 日志并标记状态为 `failed`
    - 连接状态变化时记录 info 日志
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.6, 9.3_

- [x] 7. 实现 SkillRegistry — Skill 注册表
  - [x] 7.1 创建 `packages/core/src/plugin/skill-registry.ts`，实现 `SkillRegistry` 类
    - 实现 `loadAll(skills)` 批量加载 Skill 定义，promptFile 模式下读取文件内容
    - 实现 `get(name)` 按名称查找 Skill
    - 实现 `list()` 列出所有已注册 Skill
    - 实现 `renderPrompt(name, variables?)` 模板变量替换
    - 内置变量：`{{cwd}}`、`{{os}}`、`{{date}}`、`{{input}}`
    - 未定义变量保留原始占位符，记录 debug 日志
    - _需求: 5.1, 5.6, 7.1, 7.2, 7.3, 7.4_
  - [ ]* 7.2 编写属性测试：已定义模板变量替换
    - **Property 11: 已定义模板变量替换**
    - 使用 fast-check 生成随机变量名和值，验证替换结果
    - **验证: 需求 7.1, 7.2, 7.3**
  - [ ]* 7.3 编写属性测试：未定义模板变量保留
    - **Property 12: 未定义模板变量保留**
    - 使用 fast-check 生成随机未定义变量名，验证保留原文
    - **验证: 需求 7.4**

- [x] 8. 更新 `@winches/core` 公共导出
  - 在 `packages/core/src/index.ts` 中导出所有插件模块的公共 API
    - 导出类型：`PluginConfig`、`McpServerConfig`、`SkillConfig`、`Skill`、`McpServerStatus`、`ValidationError`、`ConfigSource`、`IdeType`、`ConfigDiscoveryOptions`
    - 导出类：`McpClientManager`、`SkillRegistry`
    - 导出函数：`discoverPluginConfig`、`validatePluginConfig`、`adaptMcpTools`
    - 导出错误类：`PluginError`、`PluginConfigValidationError`、`McpConnectionError`
    - _需求: 4.6_

- [x] 9. 检查点 — 确保 @winches/core 插件模块测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 10. 实现 SlashCommandHandler — 斜杠命令处理
  - [x] 10.1 创建 `packages/agent/src/slash-commands.ts`，实现 `handleSlashCommand` 和 `getSlashCommandCompletions` 函数
    - 解析以 `/` 开头的用户输入，提取命令名和额外文本
    - `/skill-name [args]`：匹配已注册 Skill，返回 systemMessage（渲染后的提示词）和 userMessage（额外文本）
    - `/mcp-status`：返回所有 MCP Server 的连接状态、工具数量和配置来源
    - `/skills`：返回所有已注册 Skill 的名称、描述和配置来源（同时作为帮助列表）
    - 未匹配命令时返回包含可用 Skill 和内置命令列表的提示信息
    - 非 `/` 开头的输入返回 `handled: false`
    - 实现 `getSlashCommandCompletions`：返回所有可用命令的补全列表（Skill + 内置命令），供宿主程序实现 `/` 输入时的下拉提示
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1, 9.2_
  - [ ]* 10.2 编写属性测试：Slash Command 识别与 Skill 调用
    - **Property 9: Slash Command 识别与 Skill 调用**
    - 使用 fast-check 生成随机 Skill 名称和输入文本，验证解析结果
    - **验证: 需求 6.1, 6.2, 6.3**
  - [ ]* 10.3 编写属性测试：/skills 列出所有已注册 Skill
    - **Property 10: /skills 列出所有已注册 Skill**
    - 使用 fast-check 生成随机 Skill 集合，验证 /skills 响应包含所有名称、描述和来源
    - **验证: 需求 6.4, 9.2**
  - [ ]* 10.4 编写属性测试：/mcp-status 输出完整性
    - **Property 14: /mcp-status 输出完整性**
    - 使用 fast-check 生成随机 MCP 状态集合，验证输出包含每个 Server 的名称、状态、工具数量和来源
    - **验证: 需求 9.1**
  - [ ]* 10.5 编写属性测试：Slash Command 补全列表完整性
    - **Property 15: Slash Command 补全列表完整性**
    - 使用 fast-check 生成随机 Skill 集合，验证补全列表包含所有 Skill（type: skill）和内置命令（type: builtin）
    - **验证: 需求 6.6**

- [x] 11. 集成 Slash Command 到 Agent 对话循环
  - [x] 11.1 扩展 `packages/agent/src/types.ts` 中的 `AgentConfig`，新增可选字段 `skillRegistry` 和 `mcpClientManager`
    - _需求: 6.1, 6.6_
  - [x] 11.2 修改 `packages/agent/src/loop.ts`（或 `prompt.ts`），在对话循环入口处检测 Slash Command
    - 如果用户消息以 `/` 开头，调用 `handleSlashCommand` 处理
    - 如果返回 `directResponse`（/mcp-status、/skills），直接 yield text event
    - 如果返回 `systemMessage`（Skill 调用），将提示词注入 system 消息并继续对话循环
    - 如果返回 `userMessage`，将额外文本作为用户消息发送
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [x] 11.3 在 TUI 和 Gateway 宿主程序中集成 Slash Command 补全
    - 调用 `getSlashCommandCompletions` 获取补全列表
    - TUI：用户输入 `/` 时显示下拉补全菜单，列出所有可用命令和描述
    - Gateway（Telegram）：通过 Bot Commands API 或 inline 提示实现类似补全体验
    - _需求: 6.6_

- [x] 12. 更新 `@winches/agent` 公共导出
  - 在 `packages/agent/src/index.ts` 中导出 `handleSlashCommand`、`getSlashCommandCompletions` 函数和 `SlashCommandResult`、`SlashCommandCompletion` 类型
  - _需求: 6.6_

- [x] 13. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

## Notes

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点任务确保增量验证
- 属性测试验证通用正确性属性（15 个 Property 全覆盖）
- 单元测试验证具体示例和边界条件
- 所有代码使用 TypeScript（ESM only），遵循项目现有代码风格
