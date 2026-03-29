# 需求文档 — Web UI 管理/调试面板

## 简介

`@winches/web-ui` 为 winches-agent 提供本地 Web 管理面板，用于配置管理、环境变量管理、Agent 调试（查看输入/输出）和日志查看。面板由 Hono 极简 API server 提供后端接口，React SPA 提供前端界面，数据源为 `@winches/storage` 的 SQLite 数据库、项目根目录的 `config.yaml` 配置文件和 `.env` 环境变量文件。

## 术语表

- **Dashboard**：Web UI 管理面板的主页，展示系统状态概览
- **API_Server**：基于 Hono 的本地 HTTP 服务，为前端提供 REST API
- **Config_Manager**：负责读取和写入 `config.yaml` 配置文件的模块
- **Env_Manager**：负责读取和写入 `.env` 环境变量文件的模块，处理敏感值（API Key、Token 等）的遮蔽展示
- **Session_Viewer**：对话历史浏览界面，按会话展示 Agent 的输入和输出
- **Tool_Log_Viewer**：工具执行日志查看界面，展示每次工具调用的详情
- **Log_Viewer**：pino 结构化日志查看界面
- **Memory_Manager**：记忆管理界面，浏览和操作长期记忆条目
- **Task_Manager**：定时任务管理界面，查看和取消定时任务
- **StorageService**：`@winches/storage` 提供的数据持久化服务接口

## 需求

### 需求 1：API Server 启动与基础路由

**用户故事：** 作为开发者，我希望通过一条命令启动 Web UI 服务，以便在浏览器中访问管理面板。

#### 验收标准

1. WHEN 用户执行启动命令时，THE API_Server SHALL 在配置的端口（默认 3000）上启动 HTTP 服务并提供 REST API 和静态文件服务
2. THE API_Server SHALL 对所有 API 路由使用 `/api` 前缀
3. THE API_Server SHALL 对所有非 `/api` 路由返回 SPA 的 `index.html`，以支持前端路由
4. IF API_Server 启动时端口被占用，THEN THE API_Server SHALL 输出包含端口号的错误信息并退出进程
5. THE API_Server SHALL 在响应头中设置 `Content-Type` 为 `application/json`（API 路由）或对应的 MIME 类型（静态文件）

### 需求 2：配置管理 — 查看

**用户故事：** 作为开发者，我希望在 Web UI 中查看当前 Agent 的 `config.yaml` 配置和 `.env` 环境变量，以便了解系统运行参数。

#### 验收标准

1. WHEN 用户访问配置页面时，THE Config_Manager SHALL 读取 `config.yaml` 文件并展示所有配置项（LLM provider、model、embedding、审批超时、存储路径、日志级别）
2. THE Config_Manager SHALL 将包含 `${...}` 环境变量引用的字段值显示为占位符文本（如 `${AGENT_API_KEY}`），不展示实际密钥值
3. WHEN 用户访问配置页面的环境变量区域时，THE Env_Manager SHALL 读取 `.env` 文件并展示所有环境变量的键名和遮蔽后的值
4. THE Env_Manager SHALL 将 `.env` 中所有变量值遮蔽为 `••••••••` 格式展示，仅显示键名（如 `AGENT_API_KEY = ••••••••`）
5. THE Env_Manager SHALL 以 `.env.example` 文件为参考，对 `.env` 中缺失的变量在界面上标注"未设置"提示
6. THE API_Server SHALL 提供 `GET /api/config` 端点返回当前 `config.yaml` 配置内容
7. THE API_Server SHALL 提供 `GET /api/env` 端点返回 `.env` 中所有变量的键名和遮蔽后的值，响应中不包含任何明文敏感值

### 需求 3：配置管理 — 修改

**用户故事：** 作为开发者，我希望通过 Web UI 修改 Agent 的 `config.yaml` 配置和 `.env` 环境变量，以便无需手动编辑配置文件。

#### 验收标准

1. WHEN 用户在配置页面提交 `config.yaml` 修改时，THE Config_Manager SHALL 将变更写入 `config.yaml` 文件
2. THE Config_Manager SHALL 在写入前验证配置值的合法性（provider 为枚举值之一、timeout 为正整数、日志级别为 debug/info/warn/error 之一）
3. IF 用户提交的配置值不合法，THEN THE Config_Manager SHALL 返回包含具体字段名和原因的错误信息，不执行写入
4. THE Config_Manager SHALL 保留 `config.yaml` 中包含 `${...}` 环境变量引用的字段不被覆盖
5. WHEN 用户在配置页面提交 `.env` 变量修改时，THE Env_Manager SHALL 将变更写入 `.env` 文件
6. THE Env_Manager SHALL 仅允许修改已存在于 `.env` 或 `.env.example` 中定义的变量键名，不允许新增任意键名
7. IF 用户提交的环境变量值为空字符串，THEN THE Env_Manager SHALL 保留该键名并将值设为空（`KEY=`），不删除该条目
8. THE Env_Manager SHALL 在写入 `.env` 文件时保留原文件中的注释行和空行格式
9. THE API_Server SHALL 提供 `PUT /api/config` 端点接收 `config.yaml` 配置修改请求
10. THE API_Server SHALL 提供 `PUT /api/env` 端点接收 `.env` 环境变量修改请求

### 需求 4：对话历史浏览（Agent 输入/输出调试）

**用户故事：** 作为开发者，我希望在 Web UI 中查看 Agent 的对话历史，以便调试 Agent 的输入和输出。

#### 验收标准

1. WHEN 用户访问对话历史页面时，THE Session_Viewer SHALL 通过 StorageService 的 `listSessions` 方法获取会话列表，按最后活跃时间降序排列
2. WHEN 用户选择一个会话时，THE Session_Viewer SHALL 通过 StorageService 的 `getHistory` 方法加载该会话的完整消息记录
3. THE Session_Viewer SHALL 对每条消息展示角色（user/assistant/system/tool）、内容文本和时间戳
4. WHEN 消息包含 `toolCalls` 字段时，THE Session_Viewer SHALL 展示工具调用名称和参数的 JSON 格式化内容
5. WHEN 消息角色为 `tool` 时，THE Session_Viewer SHALL 展示关联的 `toolCallId` 和工具返回结果
6. THE API_Server SHALL 提供 `GET /api/sessions` 端点返回会话列表
7. THE API_Server SHALL 提供 `GET /api/sessions/:id/messages` 端点返回指定会话的消息记录

### 需求 5：工具执行日志查看

**用户故事：** 作为开发者，我希望查看每次工具调用的详细信息，以便排查工具执行问题。

#### 验收标准

1. WHEN 用户访问工具日志页面时，THE Tool_Log_Viewer SHALL 通过 StorageService 的 `getToolExecutionLogs` 方法获取工具执行记录
2. THE Tool_Log_Viewer SHALL 对每条记录展示工具名称、输入参数、输出结果、执行耗时（毫秒）和执行时间
3. WHEN 用户按工具名称筛选时，THE Tool_Log_Viewer SHALL 仅展示匹配该工具名称的记录
4. WHEN 用户按会话 ID 筛选时，THE Tool_Log_Viewer SHALL 仅展示属于该会话的记录
5. THE API_Server SHALL 提供 `GET /api/tool-logs` 端点，支持 `toolName` 和 `sessionId` 查询参数

### 需求 6：Logger 日志查看

**用户故事：** 作为开发者，我希望在 Web UI 中查看 pino 结构化日志，以便实时监控系统运行状态。

#### 验收标准

1. WHEN 用户访问日志页面时，THE Log_Viewer SHALL 读取日志文件并展示 pino JSON 格式的日志条目
2. THE Log_Viewer SHALL 对每条日志展示时间戳、日志级别（debug/info/warn/error）、消息内容和附加字段
3. WHEN 用户按日志级别筛选时，THE Log_Viewer SHALL 仅展示等于或高于所选级别的日志条目
4. THE API_Server SHALL 提供 `GET /api/logs` 端点，支持 `level` 查询参数进行级别筛选
5. THE API_Server SHALL 将日志文件路径配置为可选项，默认读取 `data/agent.log`


### 需求 7：定时任务管理

**用户故事：** 作为开发者，我希望在 Web UI 中查看和管理定时任务，以便了解和控制 Agent 的自动化行为。

#### 验收标准

1. WHEN 用户访问定时任务页面时，THE Task_Manager SHALL 通过 StorageService 的 `getPendingTasks` 方法获取待执行任务列表
2. THE Task_Manager SHALL 对每条任务展示任务 ID、触发时间、任务内容和当前状态
3. WHEN 用户点击取消按钮时，THE Task_Manager SHALL 通过 StorageService 的 `updateTaskStatus` 方法将任务状态更新为 `cancelled`
4. THE API_Server SHALL 提供 `GET /api/tasks` 端点返回任务列表
5. THE API_Server SHALL 提供 `PATCH /api/tasks/:id` 端点接收任务状态更新请求

### 需求 8：记忆管理

**用户故事：** 作为开发者，我希望在 Web UI 中浏览和管理 Agent 的长期记忆，以便了解 Agent 记住了什么信息。

#### 验收标准

1. WHEN 用户访问记忆管理页面时，THE Memory_Manager SHALL 通过 StorageService 的 `memorySummary` 方法获取记忆统计概览（长期记忆数量、平均重要性、工作记忆数量、情景记忆消息数）
2. THE Memory_Manager SHALL 展示长期记忆条目列表，包含内容、标签、重要性评分和创建时间
3. WHEN 用户输入搜索关键词时，THE Memory_Manager SHALL 通过 StorageService 的 `recall` 方法执行语义搜索并展示匹配结果
4. THE API_Server SHALL 提供 `GET /api/memories/summary` 端点返回记忆统计
5. THE API_Server SHALL 提供 `GET /api/memories` 端点返回长期记忆列表
6. THE API_Server SHALL 提供 `GET /api/memories/search` 端点，支持 `query` 查询参数进行语义搜索

### 需求 9：系统状态概览

**用户故事：** 作为开发者，我希望在 Dashboard 首页看到系统状态概览，以便快速了解 Agent 的运行情况。

#### 验收标准

1. WHEN 用户访问 Dashboard 首页时，THE Dashboard SHALL 展示以下概览信息：会话总数、最近活跃会话、长期记忆条目数、待执行定时任务数
2. THE Dashboard SHALL 展示最近 10 条工具执行记录的摘要（工具名称、执行时间、耗时）
3. THE API_Server SHALL 提供 `GET /api/status` 端点，聚合返回系统状态数据

### 需求 10：前端 SPA 路由与布局

**用户故事：** 作为开发者，我希望 Web UI 有清晰的导航结构，以便快速切换不同管理功能。

#### 验收标准

1. THE Dashboard SHALL 提供侧边栏导航，包含以下页面入口：概览、对话历史、工具日志、日志查看、定时任务、记忆管理、配置管理（含环境变量）
2. THE Dashboard SHALL 在页面顶部展示当前页面标题
3. WHEN 用户刷新浏览器时，THE Dashboard SHALL 保持当前路由状态（通过 SPA history 模式实现）
4. THE Dashboard SHALL 使用响应式布局，在 768px 以上宽度展示侧边栏，768px 以下折叠为汉堡菜单
