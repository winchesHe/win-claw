# 需求文档：MCP/Skills 集成

## 简介

为 winches-agent 项目新增 MCP（Model Context Protocol）服务器和 Skills 的插件式集成能力。该功能允许 Agent 自动扫描多个 IDE 配置目录（`.cursor`、`.claude`、`.codex`、`.kiro` 等）发现 MCP 服务器和 Skill 定义，遵循项目本地目录优先、用户全局目录兜底的查找策略，兼容多种 IDE 的配置格式。Agent 在每次会话启动时自动加载它们，并将 MCP 工具注入到现有的 ToolRegistry 中。同时支持用户通过斜杠命令（如 `/skill-name`）直接调用 Skill，实现类似 Claude Code 的扩展体验。

## 术语表

- **MCP_Server**：遵循 Model Context Protocol 规范的外部工具服务器进程，通过 stdio 或 SSE 传输与 Agent 通信，暴露一组工具供 Agent 调用
- **MCP_Client**：Agent 内部的 MCP 协议客户端，负责与 MCP_Server 建立连接、发现工具、转发调用请求并接收结果
- **MCP_Transport**：MCP_Client 与 MCP_Server 之间的通信传输层，支持 stdio（子进程标准输入输出）和 SSE（Server-Sent Events over HTTP）两种模式
- **Skill**：一个可复用的预定义提示词模板，包含名称、描述和提示词内容，用户可通过斜杠命令快速调用
- **Skill_Registry**：管理所有已加载 Skill 的注册表，提供按名称查找和列举功能
- **Slash_Command**：以 `/` 开头的用户输入指令，用于触发特定 Skill 的执行
- **Config_Source**：一个 IDE 配置目录来源，包含该目录的路径、IDE 类型标识和其中发现的 MCP/Skills 配置
- **Config_Discovery**：配置发现引擎，负责按优先级扫描多个 IDE 配置目录，合并 MCP 和 Skills 配置
- **Project_Config_Dir**：项目根目录下的 IDE 配置目录（如 `{projectRoot}/.cursor/`、`{projectRoot}/.claude/` 等），优先级高于全局配置
- **Global_Config_Dir**：用户主目录下的 IDE 配置目录（如 `~/.cursor/`、`~/.claude/` 等），作为兜底配置
- **Plugin_Config**：从多个 Config_Source 合并后的最终 MCP 服务器和 Skills 配置
- **Tool_Adapter**：将 MCP_Server 暴露的工具转换为 `@winches/core` Tool 接口的适配层
- **Agent**：winches-agent 的核心运行时，负责对话循环、工具调度和消息管理
- **ToolRegistry**：`@winches/core` 中的工具注册表，管理所有可用工具

## 需求

### 需求 1：多目录配置发现与合并

**用户故事：** 作为开发者，我希望 Agent 能自动从多个 IDE 配置目录（.cursor、.claude、.codex、.kiro 等）发现 MCP 和 Skills 配置，并支持项目本地优先、用户全局兜底的查找策略，以便兼容不同 IDE 的配置习惯。

#### 验收标准

1. THE Config_Discovery SHALL 按以下顺序扫描 IDE 配置目录：`.cursor`、`.claude`、`.codex`、`.kiro`
2. THE Config_Discovery SHALL 首先在项目根目录（cwd）下查找上述 IDE 配置目录（Project_Config_Dir），然后在用户主目录（`~`）下查找（Global_Config_Dir）
3. WHEN 同一 IDE 配置目录同时存在于项目本地和用户全局时，THE Config_Discovery SHALL 以项目本地的配置为准，忽略该 IDE 的全局配置
4. THE Config_Discovery SHALL 在每个 IDE 配置目录中查找 MCP 配置文件（如 `mcp.json` 或目录约定的配置文件）和 Skills 配置（如 `skills/` 目录或配置文件中的 skills 区块）
5. THE Config_Discovery SHALL 将所有发现的 MCP_Server 配置合并为统一列表，IF 不同 Config_Source 中存在同名 MCP_Server，THEN 项目本地的配置优先于全局配置，先扫描到的 IDE 目录优先于后扫描到的
6. THE Config_Discovery SHALL 将所有发现的 Skill 配置合并为统一列表，合并优先级规则与 MCP_Server 相同
7. IF 所有扫描路径均未发现任何 MCP 或 Skills 配置，THEN THE Config_Discovery SHALL 返回空配置且不报错，Agent 正常启动
8. THE Config_Discovery SHALL 同时支持从 `config.yaml` 的 `mcp.servers` 和 `skills` 字段读取配置，`config.yaml` 中的配置优先级最低（作为额外补充）
9. THE Config_Discovery SHALL 记录 info 级别日志，说明从哪些路径发现了配置以及最终合并结果的来源摘要

### 需求 2：MCP 服务器配置声明

**用户故事：** 作为开发者，我希望在 IDE 配置目录或 config.yaml 中声明 MCP 服务器列表，以便 Agent 知道需要连接哪些外部工具服务器。

#### 验收标准

1. THE Plugin_Config SHALL 支持在各 IDE 配置目录的 MCP 配置文件（如 `.cursor/mcp.json`、`.claude/mcp.json`）或 `config.yaml` 的 `mcp.servers` 字段下声明零个或多个 MCP_Server 配置条目
2. WHEN 声明一个 MCP_Server 配置条目时，THE Plugin_Config SHALL 要求提供 `name`（唯一标识符）、`transport`（`stdio` 或 `sse`）字段
3. WHEN transport 为 `stdio` 时，THE Plugin_Config SHALL 要求提供 `command`（可执行命令）和可选的 `args`（参数数组）、`env`（环境变量映射）字段
4. WHEN transport 为 `sse` 时，THE Plugin_Config SHALL 要求提供 `url`（SSE 端点地址）字段
5. THE Plugin_Config SHALL 支持在 MCP_Server 配置中使用 `${ENV_VAR}` 语法引用环境变量
6. IF 合并后的最终配置中存在重复的 MCP_Server name，THEN THE Config_Discovery SHALL 按优先级规则保留高优先级来源的配置，并记录 debug 级别日志说明被覆盖的条目

### 需求 3：MCP 客户端连接管理

**用户故事：** 作为开发者，我希望 Agent 能自动连接和管理 MCP 服务器的生命周期，以便在会话中使用外部工具。

#### 验收标准

1. WHEN Agent 会话启动时，THE MCP_Client SHALL 根据 Plugin_Config 中声明的 MCP_Server 列表逐一建立连接
2. WHEN transport 为 `stdio` 时，THE MCP_Client SHALL 启动子进程并通过标准输入输出与 MCP_Server 通信
3. WHEN transport 为 `sse` 时，THE MCP_Client SHALL 通过 HTTP SSE 连接与 MCP_Server 通信
4. WHEN 连接建立成功后，THE MCP_Client SHALL 调用 MCP 协议的 `tools/list` 方法发现 MCP_Server 暴露的工具列表
5. IF MCP_Server 连接失败，THEN THE MCP_Client SHALL 记录包含服务器名称和失败原因的警告日志，并继续连接其余服务器
6. WHEN Agent 会话结束或 Agent 实例被销毁时，THE MCP_Client SHALL 关闭所有活跃的 MCP_Server 连接并终止 stdio 子进程

### 需求 4：MCP 工具注入 ToolRegistry

**用户故事：** 作为开发者，我希望 MCP 服务器暴露的工具能自动注册到 ToolRegistry 中，以便 LLM 可以像使用内置工具一样调用它们。

#### 验收标准

1. WHEN MCP_Client 成功发现 MCP_Server 的工具列表后，THE Tool_Adapter SHALL 将每个 MCP 工具转换为符合 `@winches/core` Tool 接口的对象
2. THE Tool_Adapter SHALL 将 MCP 工具的名称映射为 `mcp.{serverName}.{toolName}` 格式，以避免与内置工具和其他 MCP_Server 的工具名称冲突
3. THE Tool_Adapter SHALL 将所有 MCP 工具的 dangerLevel 默认设置为 `safe`，允许 Agent 直接调用而无需用户确认
4. WHEN LLM 请求调用一个 MCP 工具时，THE Tool_Adapter SHALL 通过 MCP_Client 将调用请求转发给对应的 MCP_Server，并将 MCP_Server 的响应转换为 ToolResult 格式返回
5. IF MCP 工具调用过程中 MCP_Server 返回错误，THEN THE Tool_Adapter SHALL 返回 `{ success: false, error: string }` 格式的 ToolResult，其中 error 包含 MCP_Server 返回的错误信息
6. THE Tool_Adapter SHALL 将转换后的 MCP 工具注册到现有的 ToolRegistry 实例中，使其与内置工具统一管理

### 需求 5：Skill 配置与加载

**用户故事：** 作为开发者，我希望能在 IDE 配置目录或 config.yaml 中定义可复用的 Skill（提示词模板），以便快速调用常用的 AI 能力。

#### 验收标准

1. THE Plugin_Config SHALL 支持在各 IDE 配置目录的 Skills 配置（如 `.cursor/skills/` 目录下的 `.md` 文件、`.claude/skills/` 等）或 `config.yaml` 的 `skills` 字段下声明零个或多个 Skill 定义
2. WHEN 声明一个 Skill 时，THE Plugin_Config SHALL 要求提供 `name`（唯一标识符，仅允许小写字母、数字和连字符）、`description`（描述文本）字段
3. THE Plugin_Config SHALL 支持通过 `prompt` 字段直接内联提示词内容，或通过 `promptFile` 字段引用外部提示词文件路径
4. IF Skill 配置同时提供了 `prompt` 和 `promptFile` 字段，THEN THE Plugin_Config 解析器 SHALL 返回描述性错误，指出两者不可同时使用
5. IF 配置中存在重复的 Skill name，THEN THE Plugin_Config 解析器 SHALL 返回包含重复名称的描述性错误
6. WHEN Agent 会话启动时，THE Skill_Registry SHALL 加载所有配置中声明的 Skill 定义，并在 `promptFile` 模式下读取对应文件内容

### 需求 6：Slash Command 调用 Skill

**用户故事：** 作为用户，我希望通过输入 `/skill-name` 的方式快速调用已注册的 Skill，以便高效地使用预定义的 AI 能力。

#### 验收标准

1. WHEN 用户输入以 `/` 开头的消息时，THE Agent SHALL 将该消息识别为 Slash_Command 并尝试匹配已注册的 Skill
2. WHEN Slash_Command 匹配到已注册的 Skill 时，THE Agent SHALL 将该 Skill 的提示词内容作为 system 消息注入到当前对话上下文中
3. WHEN Slash_Command 后跟随额外文本（如 `/translate 你好世界`）时，THE Agent SHALL 将额外文本作为用户消息与 Skill 提示词一起发送给 LLM
4. IF Slash_Command 未匹配到任何已注册的 Skill 或内置命令，THEN THE Agent SHALL 返回包含可用 Skill 和内置命令列表的提示信息
5. THE Agent SHALL 在 TUI 和 Gateway 两种宿主环境中均支持 Slash_Command 功能
6. WHEN 用户在 TUI 或 Gateway 中输入 `/` 字符时，THE Agent 的宿主程序 SHALL 显示下拉补全列表，列出所有可用的 Slash Command（已注册 Skill 和内置命令），每项包含命令名称和描述

### 需求 7：Skill 提示词模板变量替换

**用户故事：** 作为开发者，我希望 Skill 的提示词支持变量占位符，以便在调用时动态注入上下文信息。

#### 验收标准

1. THE Skill_Registry SHALL 支持提示词中使用 `{{variableName}}` 格式的变量占位符
2. WHEN 调用 Skill 时，THE Skill_Registry SHALL 自动替换以下内置变量：`{{cwd}}`（当前工作目录）、`{{os}}`（操作系统类型）、`{{date}}`（当前日期）
3. WHEN Slash_Command 包含额外文本时，THE Skill_Registry SHALL 将额外文本注入到 `{{input}}` 变量中
4. IF 提示词中包含未定义的变量占位符，THEN THE Skill_Registry SHALL 保留原始占位符文本不做替换，并记录 debug 级别日志

### 需求 8：MCP/Skills 配置解析与验证

**用户故事：** 作为开发者，我希望从各 IDE 配置目录和 config.yaml 中加载的 MCP 和 Skills 配置在加载时被严格验证，以便尽早发现配置错误。

#### 验收标准

1. WHEN 各 Config_Source 的配置文件被加载时，THE Plugin_Config 解析器 SHALL 验证 MCP 和 Skills 配置的结构是否符合预定义的 Schema
2. IF MCP_Server 配置缺少必填字段，THEN THE Plugin_Config 解析器 SHALL 返回包含缺失字段名称、服务器名称和配置来源路径的描述性错误
3. IF Skill 的 name 字段包含非法字符（大写字母、空格、特殊符号），THEN THE Plugin_Config 解析器 SHALL 返回包含非法名称和允许字符规则的描述性错误
4. IF `promptFile` 引用的文件路径不存在，THEN THE Plugin_Config 解析器 SHALL 返回包含文件路径的描述性错误
5. THE Plugin_Config 解析器 SHALL 在所有验证错误收集完毕后一次性返回全部错误列表，而非遇到第一个错误即停止

### 需求 9：MCP/Skills 运行时状态查询

**用户故事：** 作为用户，我希望能查看当前会话中已加载的 MCP 服务器和 Skills 的状态，以便了解可用的扩展能力。

#### 验收标准

1. WHEN 用户输入 `/mcp-status` 时，THE Agent SHALL 返回所有已配置 MCP_Server 的连接状态（已连接、连接失败、未连接）、各服务器暴露的工具数量以及配置来源（哪个 IDE 目录或 config.yaml）
2. WHEN 用户输入 `/skills` 时，THE Agent SHALL 返回所有已注册 Skill 的名称、描述和配置来源列表（此命令同时作为 Skill 帮助列表）
3. THE Agent SHALL 在 MCP_Server 连接状态发生变化时（连接成功、断开、重连）记录 info 级别日志
