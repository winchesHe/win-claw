# 实现计划：@winches/tui 终端聊天界面

## 概述

基于 ink（React 风格终端 UI 框架）实现终端聊天界面，嵌入 `@winches/agent` 实例，
提供流式对话、工具调用可视化、危险操作审批、Markdown 渲染和会话管理功能。

## 任务列表

- [x] 1. 配置 package.json 依赖
  - 在 `packages/tui/package.json` 中添加运行时依赖：`ink`、`react`、`ink-markdown`（或 `marked`）、`@winches/agent`、`@winches/storage`、`js-yaml`
  - 添加开发依赖：`@types/react`、`@types/node`、`fast-check`
  - 添加 `start` 脚本：`"start": "node dist/index.js"`
  - 确认 `tsconfig.json` 中 `jsx` 设置为 `react-jsx`
  - _需求：1.1_


- [x] 2. 实现 `src/types.ts`（TUI 内部类型）
  - [x] 2.1 定义 TUI 内部类型
    - 定义 `TuiConfig` 接口（llm、embedding、approval、storage 等字段，对应 `config.yaml` 结构）
    - 定义 `ChatMessage` 联合类型（`user | assistant | tool_call | tool_result | error | system`）
    - 定义 `AppState` 接口（`messages`、`status`、`currentSessionId`、`pendingApproval`）
    - 定义 `AgentStatus` 重导出（`idle | running | waiting_approval`）
    - _需求：1.1、2.4、3.1、4.1、5.1_
  - [ ]* 2.2 为 `ChatMessage` 类型编写属性测试
    - **属性 1：ChatMessage 判别联合类型完整性** — 每种 `type` 值都能被正确区分
    - **验证：需求 3.1、4.1**

- [x] 3. 实现 `src/config.ts`（TuiConfig 加载）
  - [x] 3.1 实现配置加载函数 `loadConfig(configPath?: string): TuiConfig`
    - 使用 `js-yaml` 读取并解析 `config.yaml`
    - 实现环境变量覆盖逻辑（`AGENT_API_KEY` 覆盖 `llm.apiKey` 等）
    - 校验必填字段 `llm.provider` 和 `llm.apiKey`，缺失时抛出带明确信息的错误
    - 设置默认值：`approval.timeout = 300`、`approval.defaultAction = "reject"`
    - _需求：1.1、1.2、1.3_
  - [ ]* 3.2 为配置加载编写属性测试
    - **属性 2：环境变量优先级** — 任意合法的 `AGENT_API_KEY` 值都应覆盖 `config.yaml` 中的 `llm.apiKey`
    - **验证：需求 1.3**
  - [ ]* 3.3 为配置校验编写单元测试
    - 测试缺少 `llm.provider` 时抛出错误
    - 测试缺少 `llm.apiKey` 时抛出错误
    - _需求：1.2_


- [x] 4. 实现 UI 组件
  - [x] 4.1 实现 `src/components/InputBox.tsx`
    - 使用 `ink` 的 `TextInput`（或 `useInput`）实现底部固定输入框
    - 支持 `disabled` 属性，Agent 运行时显示等待提示（如 `[Agent 思考中...]`）
    - Enter 键发送非空消息，空消息忽略
    - 通过 `onSubmit` 回调向上传递消息内容
    - _需求：2.1、2.2、2.3、2.4_
  - [x] 4.2 实现 `src/components/MessageBubble.tsx`
    - 接收 `role`（`user | assistant`）和 `content` 属性
    - 用户消息右对齐（或带前缀 `You:`），助手消息左对齐（带前缀 `Agent:`）
    - 集成 Markdown 渲染：代码块高亮、列表、粗体、行内代码
    - 支持 `streaming` 属性，流式状态下对已接收内容增量渲染
    - _需求：3.1、6.1、6.2、6.3、6.4、6.5、6.6_
  - [x] 4.3 实现 `src/components/ToolCallCard.tsx`
    - 接收 `toolName`、`params`、`status`（`running | done | failed`）、`result`、`dangerLevel` 属性
    - 显示工具名称和参数摘要，内容截断至 200 字符，超出显示 `...`
    - `status = running` 时显示旋转动画（ink 的 `Spinner` 或自定义）
    - `dangerLevel = dangerous` 时工具名称使用红色高亮
    - _需求：4.1、4.2、4.3、4.4_
  - [ ]* 4.4 为 ToolCallCard 截断逻辑编写属性测试
    - **属性 3：内容截断不变式** — 任意长度的输入字符串，截断后显示长度不超过 200 字符
    - **验证：需求 4.3**
  - [x] 4.5 实现 `src/components/ApprovalPrompt.tsx`
    - 接收 `request`（`ApprovalRequest`）、`onApprove`、`onReject`、`timeoutSeconds` 属性
    - 显示工具名、危险等级和操作描述
    - 使用 `useInput` 监听 `y/Y`（批准）和 `n/N`（拒绝），其他按键忽略
    - 实现倒计时逻辑，超时后自动调用 `onReject` 并显示超时提示
    - _需求：5.1、5.2、5.3、5.4、5.5_
  - [x] 4.6 实现 `src/components/MessageList.tsx`
    - 接收 `messages: ChatMessage[]` 属性，渲染消息列表
    - 根据消息类型分发到 `MessageBubble`、`ToolCallCard` 或系统提示文本
    - 限制渲染条数（仅显示最近 N 条），避免终端缓冲区溢出
    - _需求：3.3、3.4_


- [x] 5. 实现 hooks
  - [x] 5.1 实现 `src/hooks/useSession.ts`
    - 封装 `StorageService` 的会话操作：`createSession`、`switchSession`、`listSessions`、`loadHistory`
    - 解析 `/new`、`/sessions`、`/switch <id>`、`/help` 命令，返回对应操作结果
    - `/switch <id>` 时若 sessionId 不存在，返回错误信息"会话不存在"
    - StorageService 操作失败时降级为无持久化模式，返回警告信息
    - _需求：7.1、7.2、7.3、7.4、7.5、8.2_
  - [ ]* 5.2 为命令解析编写属性测试
    - **属性 4：命令解析完整性** — 任意以 `/` 开头的字符串都能被识别为命令或返回未知命令提示，不会抛出异常
    - **验证：需求 7.5_
  - [x] 5.3 实现 `src/hooks/useAgent.ts`
    - 接收 `agent: Agent` 实例，封装 `agent.chat()` 的调用和事件处理
    - 处理 `text` 事件：追加到当前 assistant 消息
    - 处理 `tool_call` / `tool_result` 事件：插入/更新 `ToolCallCard` 消息
    - 处理 `approval_needed` 事件：设置 `pendingApproval` 状态，暂停输入
    - 处理 `done` 事件：标记消息完成，恢复 InputBox
    - `chat()` 抛出异常时，在消息列表插入错误提示，恢复 InputBox
    - _需求：3.1、3.2、4.1、4.2、5.1、8.1_
  - [ ]* 5.4 为 useAgent 事件处理编写单元测试
    - 测试 `text` 事件追加逻辑
    - 测试 `done` 事件恢复 InputBox 状态
    - 测试异常时错误消息插入和状态恢复
    - _需求：3.1、3.2、8.1_

- [x] 6. 检查点 — 组件与 hooks 构建验证
  - 运行 `pnpm --filter @winches/tui build`，确保所有组件和 hooks 无 TypeScript 编译错误
  - 确保所有测试通过，向用户确认是否继续


- [x] 7. 实现根组件 `src/app.tsx`
  - [x] 7.1 实现 `App` 组件骨架与布局
    - 使用 ink 的 `Box` 和 `Text` 组件实现两区域布局：上方消息列表 + 下方固定 InputBox
    - 接收 `config: TuiConfig` 和 `agent: Agent` 作为 props
    - 集成 `useSession` 和 `useAgent` hooks
    - 启动时调用 `useSession.loadHistory` 加载默认 Session 历史，显示欢迎信息
    - _需求：1.4、3.3_
  - [x] 7.2 实现消息发送与命令分发逻辑
    - InputBox `onSubmit` 时：检测是否为 `/` 命令，分发给 `useSession`；否则调用 `useAgent.sendMessage`
    - Agent 运行时（`status = running | waiting_approval`）禁用 InputBox
    - _需求：2.2、2.3、2.4、7.1、7.2、7.3、7.4、7.5_
  - [x] 7.3 实现 ApprovalPrompt 集成
    - `pendingApproval` 非空时渲染 `ApprovalPrompt`，覆盖 InputBox 区域
    - `onApprove`/`onReject` 回调解析 `agent.onApprovalNeeded` 的 Promise
    - _需求：5.1、5.2、5.3、5.4、5.5_
  - [x] 7.4 实现 Ctrl+C 退出处理
    - Agent 空闲时直接退出，确保 Session 数据已持久化
    - Agent 运行时显示确认提示"Agent 正在运行，确认退出？(y/n)"，用户确认后退出
    - _需求：2.5、8.3_
  - [x] 7.5 实现终端尺寸自适应
    - 使用 ink 的 `useStdout` 获取终端尺寸，监听 `resize` 事件触发重新布局
    - _需求：8.4_

- [x] 8. 实现入口 `src/index.ts`
  - 调用 `loadConfig()` 加载配置，捕获校验错误并输出到 stderr，以非零退出码退出
  - 根据配置初始化 `LLMProvider`（通过 `@winches/ai`）、`StorageService`（通过 `@winches/storage`）、`ToolRegistry`（通过 `@winches/core`）
  - 创建 `Agent` 实例，使用 ink 的 `render` 函数挂载 `<App>` 组件
  - _需求：1.1、1.2、1.3、1.4_

- [x] 9. 最终检查点 — 完整构建验证
  - 运行 `pnpm --filter @winches/tui build`，确保完整构建无错误
  - 确保所有非可选测试通过，向用户确认是否有问题


## 备注

- 标记 `*` 的子任务为可选项，可跳过以加快 MVP 进度
- 每个任务均引用具体需求编号以保证可追溯性
- 检查点确保增量验证，避免积累错误
- 属性测试验证普遍正确性，单元测试验证具体边界情况
