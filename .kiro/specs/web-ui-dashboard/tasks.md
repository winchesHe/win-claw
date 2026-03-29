# 实现计划：Web UI 管理/调试面板

## 概述

基于 Hono + React SPA 架构实现 `@winches/web-ui` 管理面板。后端提供 REST API 读写 StorageService、config.yaml 和 .env 文件；前端通过 Vite 构建为静态文件由 Hono 提供服务。实现按后端服务层 → 路由层 → 前端 SPA 的顺序推进，每步附带属性测试验证正确性。

## 任务

- [x] 1. 项目结构搭建与依赖配置
  - [x] 1.1 更新 `packages/web-ui/package.json`，添加依赖（hono、yaml、react、react-dom、react-router-dom）和 devDependencies（vite、@vitejs/plugin-react、@types/react、@types/react-dom）
    - 添加 `@winches/storage` 为 `workspace:*` 依赖
    - 添加 `start` 脚本：`node dist/index.js`
    - 添加 `build:client` 脚本：`vite build`
    - _需求: 1.1_

  - [x] 1.2 创建后端目录结构和基础文件
    - 创建 `packages/web-ui/src/server/index.ts`：Hono app 创建、静态文件服务、SPA fallback、启动逻辑
    - 创建 `packages/web-ui/src/server/types.ts`：后端类型定义（AppConfig、EnvVar、LogEntry、SystemStatus）
    - 创建 `packages/web-ui/src/server/errors.ts`：WebUIError 基类
    - 创建空的路由和服务目录文件
    - _需求: 1.1, 1.2, 1.3, 1.5_

  - [x] 1.3 更新 `packages/web-ui/src/index.ts` 导出 `startServer()` 函数
    - _需求: 1.1_

  - [x] 1.4 创建 `packages/web-ui/tsdown.config.ts` 和 `packages/web-ui/tsconfig.json`
    - tsdown 入口为 `src/index.ts`（仅编译后端代码）
    - _需求: 1.1_

  - [x] 1.5 创建 `packages/web-ui/vite.config.ts` 配置前端构建
    - 入口：`src/client/index.html`
    - 输出目录：`dist/client/`
    - _需求: 10.3_

- [x] 2. 检查点 — 确保项目结构正确
  - 确保 `pnpm install` 成功，`pnpm --filter @winches/web-ui run build` 能编译后端代码，确认所有测试通过，有问题请询问用户。

- [x] 3. 后端服务层实现
  - [x] 3.1 实现 ConfigService（`packages/web-ui/src/server/services/config-service.ts`）
    - 实现 `getConfig()`：读取 config.yaml，保留 `${...}` 引用不解析
    - 实现 `updateConfig()`：验证配置值合法性（provider 枚举、timeout 正整数、logging.level 枚举），保护 `${...}` 引用字段不被覆盖，先写临时文件再 rename
    - _需求: 2.1, 2.2, 2.6, 3.1, 3.2, 3.3, 3.4, 3.9_

  - [ ]* 3.2 编写 ConfigService 属性测试
    - **Property 3: ${...} 引用读取保留** — 生成包含 `${...}` 引用的 YAML，验证 getConfig() 原样返回
    - **验证需求: 2.2**
    - **Property 5: 配置验证拒绝非法值** — 生成非法枚举值和非正整数，验证 updateConfig() 抛出错误
    - **验证需求: 3.2, 3.3**
    - **Property 6: ${...} 引用写入保护** — 生成更新请求覆盖 `${...}` 字段，验证字段不变
    - **验证需求: 3.4**
    - **Property 7: 配置修改 Round-Trip** — 生成合法配置更新，验证写入后读取一致
    - **验证需求: 3.1**

  - [x] 3.3 实现 EnvService（`packages/web-ui/src/server/services/env-service.ts`）
    - 实现 `getEnvVars()`：逐行解析 .env，所有值遮蔽为 `••••••••`，对照 .env.example 标注缺失变量
    - 实现 `updateEnvVars()`：仅允许已知键名，保留注释和空行，替换匹配键名的值
    - _需求: 2.3, 2.4, 2.5, 2.7, 3.5, 3.6, 3.7, 3.8, 3.10_

  - [ ]* 3.4 编写 EnvService 属性测试
    - **Property 2: .env 值遮蔽保证** — 生成随机 KEY=VALUE 对，验证 getEnvVars() 返回中无明文值
    - **验证需求: 2.3, 2.4, 2.7**
    - **Property 4: .env.example 缺失变量标注** — 生成 .env 和 .env.example 内容，验证缺失变量标记为 isSet: false
    - **验证需求: 2.5**
    - **Property 8: .env 仅允许已知键名** — 生成包含未知键名的更新请求，验证被拒绝
    - **验证需求: 3.6**
    - **Property 9: .env 写入保留注释和空行** — 生成含注释/空行的 .env，更新后验证结构不变
    - **验证需求: 3.8**
    - **Property 10: .env 修改 Round-Trip** — 生成已知键名和新值，验证写入后文件值一致
    - **验证需求: 3.5, 3.7**

  - [x] 3.5 实现 LogService（`packages/web-ui/src/server/services/log-service.ts`）
    - 实现 `getLogs()`：读取 pino JSON 日志文件，逐行解析，支持按级别筛选（debug=20, info=30, warn=40, error=50），JSON 解析失败的行跳过
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 3.6 编写 LogService 属性测试
    - **Property 14: pino 日志解析完整性** — 生成合法 pino JSON 行，验证解析字段完整
    - **验证需求: 6.1, 6.2**
    - **Property 15: 日志级别筛选** — 生成随机日志和级别，验证筛选结果仅包含等于或高于所选级别的条目
    - **验证需求: 6.3**

- [x] 4. 检查点 — 服务层测试通过
  - 确保所有服务层属性测试和单元测试通过，有问题请询问用户。

- [x] 5. 后端路由层实现
  - [x] 5.1 实现 status 路由（`packages/web-ui/src/server/routes/status.ts`）
    - `GET /api/status`：聚合 StorageService 数据返回 SystemStatus（sessionCount、recentSession、memoryCount、pendingTaskCount、recentToolLogs 最多 10 条）
    - _需求: 9.1, 9.2, 9.3_

  - [ ]* 5.2 编写 status 路由属性测试
    - **Property 16: 系统状态概览完整性** — mock StorageService 返回随机数据，验证响应包含所有必需字段且 recentToolLogs 长度不超过 10
    - **验证需求: 9.1, 9.2**

  - [x] 5.3 实现 config 路由（`packages/web-ui/src/server/routes/config.ts`）
    - `GET /api/config`：调用 ConfigService.getConfig() 返回配置
    - `PUT /api/config`：调用 ConfigService.updateConfig()，验证失败返回 400
    - `GET /api/env`：调用 EnvService.getEnvVars() 返回遮蔽后的变量列表
    - `PUT /api/env`：调用 EnvService.updateEnvVars()，未知键名返回 400
    - _需求: 2.6, 2.7, 3.9, 3.10_

  - [x] 5.4 实现 sessions 路由（`packages/web-ui/src/server/routes/sessions.ts`）
    - `GET /api/sessions`：调用 StorageService.listSessions()，按 lastActiveAt 降序返回
    - `GET /api/sessions/:id/messages`：调用 StorageService.getHistory()，返回完整消息记录（含 toolCalls、toolCallId）
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 5.5 编写 sessions 路由属性测试
    - **Property 11: 会话列表按活跃时间降序** — 生成随机会话列表，验证返回降序排列
    - **验证需求: 4.1**
    - **Property 12: 消息包含角色相关完整字段** — 生成包含不同角色的消息，验证字段完整性
    - **验证需求: 4.3, 4.4, 4.5**

  - [x] 5.6 实现 tool-logs 路由（`packages/web-ui/src/server/routes/tool-logs.ts`）
    - `GET /api/tool-logs`：调用 StorageService.getToolExecutionLogs()，支持 toolName 和 sessionId 查询参数筛选
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.7 编写 tool-logs 路由属性测试
    - **Property 13: 工具日志筛选正确性** — 生成随机日志和筛选条件，验证结果匹配所有指定条件
    - **验证需求: 5.3, 5.4**

  - [x] 5.8 实现 logs 路由（`packages/web-ui/src/server/routes/logs.ts`）
    - `GET /api/logs`：调用 LogService.getLogs()，支持 level 查询参数
    - _需求: 6.4_

  - [x] 5.9 实现 tasks 路由（`packages/web-ui/src/server/routes/tasks.ts`）
    - `GET /api/tasks`：调用 StorageService.getPendingTasks()
    - `PATCH /api/tasks/:id`：调用 StorageService.updateTaskStatus()，任务不存在返回 404
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 5.10 实现 memories 路由（`packages/web-ui/src/server/routes/memories.ts`）
    - `GET /api/memories/summary`：调用 StorageService.memorySummary()
    - `GET /api/memories`：调用 StorageService.recall() 返回长期记忆列表
    - `GET /api/memories/search`：接收 query 参数，调用 StorageService.recall() 执行语义搜索
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 6. 后端集成 — Hono App 组装与 SPA Fallback
  - [x] 6.1 在 `packages/web-ui/src/server/index.ts` 中组装所有路由，配置静态文件服务和 SPA fallback
    - 注册所有 `/api/*` 路由
    - 配置 `dist/client/` 静态文件服务
    - 非 `/api` 路由返回 `index.html`（SPA fallback）
    - 端口占用时输出错误信息并退出
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 6.2 编写 SPA Fallback 属性测试
    - **Property 1: SPA Fallback 路由** — 生成随机非 /api 路径，验证返回 index.html 内容，状态码 200
    - **验证需求: 1.3, 10.3**

  - [ ]* 6.3 编写后端集成单元测试
    - 使用 Hono `app.request()` 测试各端点存在性和基本响应格式
    - 测试错误处理（StorageService 调用失败返回 500、会话不存在返回 404）
    - _需求: 1.2, 1.5_

- [x] 7. 检查点 — 后端全部测试通过
  - 确保所有后端属性测试和单元测试通过，有问题请询问用户。

- [x] 8. 前端 SPA 实现
  - [x] 8.1 创建前端入口文件和基础布局
    - 创建 `packages/web-ui/src/client/index.html`、`main.tsx`、`App.tsx`
    - 创建 `packages/web-ui/src/client/api.ts`：fetch 封装，统一处理 `/api/*` 请求
    - 创建 `packages/web-ui/src/client/components/Layout.tsx`：侧边栏 + 顶栏布局，响应式（768px 断点）
    - 创建 `packages/web-ui/src/client/components/Sidebar.tsx`：导航菜单（概览、对话历史、工具日志、日志查看、定时任务、记忆管理、配置管理）
    - 配置 React Router，定义所有前端路由
    - _需求: 10.1, 10.2, 10.3, 10.4_

  - [x] 8.2 实现 Dashboard 页面（`packages/web-ui/src/client/pages/Dashboard.tsx`）
    - 调用 `GET /api/status` 展示系统状态概览
    - 展示会话总数、最近活跃会话、长期记忆数、待执行任务数
    - 展示最近 10 条工具执行记录摘要
    - _需求: 9.1, 9.2_

  - [x] 8.3 实现 Sessions 页面（`packages/web-ui/src/client/pages/Sessions.tsx`）
    - 调用 `GET /api/sessions` 展示会话列表
    - 选择会话后调用 `GET /api/sessions/:id/messages` 展示消息记录
    - 按角色区分展示消息，工具调用展示名称和参数 JSON，tool 角色展示 toolCallId
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 8.4 实现 ToolLogs 页面（`packages/web-ui/src/client/pages/ToolLogs.tsx`）
    - 调用 `GET /api/tool-logs` 展示工具执行日志
    - 支持按工具名称和会话 ID 筛选
    - 展示工具名称、输入参数、输出结果、执行耗时、执行时间
    - _需求: 5.1, 5.2, 5.3, 5.4_

  - [x] 8.5 实现 Logs 页面（`packages/web-ui/src/client/pages/Logs.tsx`）
    - 调用 `GET /api/logs` 展示 pino 日志
    - 支持按日志级别筛选（debug/info/warn/error）
    - 展示时间戳、级别、消息内容、附加字段
    - _需求: 6.1, 6.2, 6.3_

  - [x] 8.6 实现 Tasks 页面（`packages/web-ui/src/client/pages/Tasks.tsx`）
    - 调用 `GET /api/tasks` 展示定时任务列表
    - 展示任务 ID、触发时间、任务内容、状态
    - 取消按钮调用 `PATCH /api/tasks/:id` 更新状态为 cancelled
    - _需求: 7.1, 7.2, 7.3_

  - [x] 8.7 实现 Memories 页面（`packages/web-ui/src/client/pages/Memories.tsx`）
    - 调用 `GET /api/memories/summary` 展示记忆统计概览
    - 调用 `GET /api/memories` 展示长期记忆列表（内容、标签、重要性、创建时间）
    - 搜索框调用 `GET /api/memories/search?query=...` 执行语义搜索
    - _需求: 8.1, 8.2, 8.3_

  - [x] 8.8 实现 Config 页面（`packages/web-ui/src/client/pages/Config.tsx`）
    - 调用 `GET /api/config` 展示配置项，`${...}` 字段显示为只读
    - 调用 `GET /api/env` 展示环境变量（遮蔽值），标注缺失变量
    - 提交配置修改调用 `PUT /api/config`，展示验证错误
    - 提交环境变量修改调用 `PUT /api/env`，展示未知键名错误
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 9. 检查点 — 前端构建成功
  - 确保 `pnpm --filter @winches/web-ui run build:client` 构建成功，确认所有测试通过，有问题请询问用户。

- [x] 10. 端到端集成与收尾
  - [x] 10.1 更新根目录 `package.json` 添加 `start:web-ui` 脚本
    - 脚本内容：`pnpm --filter @winches/web-ui run start`
    - _需求: 1.1_

  - [x] 10.2 确保后端构建和前端构建流程串联
    - 验证 `pnpm --filter @winches/web-ui run build` 编译后端 + `build:client` 构建前端
    - 验证 Hono 静态文件服务能正确提供 `dist/client/` 中的前端产物
    - _需求: 1.1, 1.3, 10.3_

- [x] 11. 最终检查点 — 全部测试通过
  - 确保 `pnpm test` 全部通过，`pnpm build` 全部成功，`pnpm check` 无错误，有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保需求可追溯
- 属性测试验证设计文档中的 16 个正确性属性
- 检查点确保增量验证，避免问题累积
- 后端使用 Hono `app.request()` 进行内存级 HTTP 测试，无需启动真实服务器
- 前端页面使用基础 CSS 即可，不引入 UI 框架以保持轻量
