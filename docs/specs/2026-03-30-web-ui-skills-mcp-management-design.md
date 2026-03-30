# Web UI Skills 与 MCP 管理设计

> 日期：2026-03-30
> 范围：`@winches/web-ui`
> 关联文档：`docs/specs/winches-agent-design.md`

## 1. 背景

当前 `@winches/web-ui` 已经具备以下能力：

- 浏览会话历史
- 查看工具执行日志
- 管理定时任务与长期记忆
- 读写 `config.yaml` 与 `.env`
- 展示系统状态概览

与此同时，Agent 运行时已经具备 Skill 与 MCP 能力：

- `@winches/core` 提供 `discoverPluginConfig()`，用于从项目目录、全局目录和 `config.yaml` 发现 Skill 与 MCP 配置
- `SkillRegistry` 负责加载 Skill 文档
- `McpClientManager` 负责 MCP 连接和状态汇总
- `@winches/agent` 已支持 `/skills`、`/mcp-status` 和 slash-skill 执行语义

现状的问题不是“底层没有能力”，而是“缺少一个可视化管理入口”。使用者现在只能通过编辑磁盘上的配置文件和目录来配置 Skill 与 MCP，门槛高、来源不透明、优先级不直观，也不便排查“为什么某个 Skill 生效或被覆盖”。

因此，本设计聚焦于为 Web UI 增加两个一等管理模块：

- Skills 管理
- MCP 管理

目标是让 Web UI 成为“插件配置的可视化观察与项目级编辑入口”，而不是引入一套脱离现有 runtime 的新配置系统。

## 2. 设计目标

### 2.1 用户目标

用户应能够在 Web UI 中完成以下工作：

- 查看当前最终生效的 Skill 列表
- 查看当前最终生效的 MCP Server 列表及连接状态
- 明确知道每个条目来自哪里
- 明确知道同名条目是否被更高优先级来源覆盖
- 在“项目级”范围内新增、编辑、删除 Skill 配置
- 在“项目级”范围内新增、编辑、删除 MCP 配置
- 快速定位配置错误、路径错误、字段缺失和连接失败原因

### 2.2 系统目标

- 复用 `@winches/core` 现有配置发现逻辑，避免双轨规则
- Web UI 只负责“展示 + 编排 + 项目级写入”，不复制 runtime 核心语义
- 保持当前 Web UI 的技术风格：Hono 路由 + service 类 + React 页面
- 将风险控制在项目工作区范围内，避免默认修改用户全局目录

### 2.3 非目标

本期不包含以下内容：

- 在 Web UI 中直接编辑全局 Skill 仓库或用户 Home 目录下的任意技能文件
- 在 Web UI 中启动常驻 MCP 子进程并长时间维持完整运行态管理
- 在 Web UI 中直接编辑 Skill 文档大段正文的富文本体验
- 构建一个通用插件市场或在线下载安装中心
- 将所有来源统一迁移到单一配置文件

## 3. 设计原则

### 3.1 发现逻辑单一事实来源

Skill 与 MCP 的来源、优先级和合并规则以 `@winches/core` 的 `discoverPluginConfig()` 为准。Web UI 不单独定义第二套扫描规则。

### 3.2 编辑范围限定为项目级

Web UI 提供“项目级可写，全局级只读”的默认策略：

- 可写：项目根目录下的 `config.yaml`、项目级 `.<ide>/mcp.json`、项目级 `.<ide>/skills/`
- 只读：`~/.codex/...`、`~/.agents/...`、`~/.skills-manager/...`、其他全局来源

这样既满足日常项目管理诉求，也避免 Web UI 越权修改用户的个人全局环境。

### 3.3 最终视图与来源视图并存

仅展示“最终生效条目”是不够的，因为用户仍然不知道它为何生效；仅展示“原始来源”也不够，因为用户不知道实际运行时读到什么。因此 UI 需要同时提供：

- 最终生效视图
- 来源与覆盖关系视图

### 3.4 优先支持可解释性而非高级功能

第一阶段优先让用户回答三个问题：

- 现在有哪些 Skill / MCP 在生效？
- 它们来自哪里？
- 为什么我的修改没有生效？

在这些问题没被解决前，不优先做复杂的拖拽、批量导入、可视化拓扑等增强功能。

## 4. 现有架构对接

### 4.1 Web UI 当前结构

现有 `@winches/web-ui` 已包含：

- 客户端：React SPA + `react-router-dom`
- 服务端：Hono 本地 API
- 配置读写：`ConfigService`、`EnvService`
- 页面导航：Sidebar 中已有“概览 / 对话历史 / 工具日志 / 日志 / 定时任务 / 记忆 / 配置管理”

因此新增 Skills 和 MCP 管理应继续采用同样的组织方式：

- 新增 API route
- 新增 service 类
- 新增 client page
- Sidebar 增加导航入口

### 4.2 Core 当前插件模型

`@winches/core` 已定义以下核心模型：

- `SkillConfig`
- `Skill`
- `McpServerConfig`
- `PluginConfig`
- `McpServerStatus`
- `ConfigSource`

并已实现配置发现逻辑：

- 项目级 IDE 目录
- 全局 IDE 目录
- 全局 skill 特殊目录
- `config.yaml`

Web UI 新设计应直接复用这些类型和发现逻辑，并在必要时补充“面向 UI 的聚合视图模型”。

## 5. 信息架构

### 5.1 导航调整

Sidebar 新增两个一级入口：

- `Skills`
- `MCP`

建议导航顺序调整为：

- 概览
- 对话历史
- 工具日志
- 日志查看
- 定时任务
- 记忆管理
- Skills
- MCP
- 配置管理

这样可以保持“运行态观测”在前，“插件配置”居中，“底层配置文件编辑”在后。

### 5.2 Skills 页面结构

`Skills` 页面分为三个区域：

1. 页面头部摘要
2. 最终生效列表
3. 来源与覆盖详情抽屉或详情面板

页面头部摘要展示：

- 已发现 Skill 总数
- 最终生效 Skill 数
- 被覆盖 Skill 数
- 仅项目级 Skill 数

最终生效列表每行展示：

- 名称
- 描述
- 来源范围（project / global / yaml）
- IDE 类型（codex / claude / cursor / kiro / config-yaml）
- 文档模式（inline / file）
- 文档路径或内联标识
- 状态标签（active / shadowed elsewhere / invalid）

点击某一行后，右侧详情区展示：

- 最终生效定义
- 所有同名来源候选
- 优先级顺序
- 是否允许编辑
- 预览 Skill 文档正文前若干行

### 5.3 MCP 页面结构

`MCP` 页面同样分为三个区域：

1. 页面头部摘要
2. 最终生效 server 列表
3. 详情区

页面头部摘要展示：

- 已发现 MCP server 总数
- 最终生效 server 数
- 当前连接成功数
- 当前连接失败数

最终生效列表每行展示：

- 名称
- transport（stdio / sse）
- 连接状态（connected / failed / disconnected / unknown）
- toolCount
- 来源范围与 IDE 类型
- 核心配置摘要
  - `stdio` 显示 command + args 摘要
  - `sse` 显示 URL 摘要

详情区展示：

- 完整配置
- 环境变量键列表
- 来源和覆盖关系
- 最近错误信息
- 测试连接结果

## 6. 配置来源与优先级表达

### 6.1 需要可视化的来源

UI 需要明确区分以下来源：

- `project:codex`
- `project:claude`
- `project:cursor`
- `project:kiro`
- `global:codex`
- `global:claude`
- `global:cursor`
- `global:kiro`
- `global:codex-superpowers`
- `global:skills-manager`
- `yaml:config.yaml`

其中后两项属于 `discoverPluginConfig()` 中的附加技能目录语义，应在 UI 中以更易懂名称展示，而不是直接暴露内部实现术语。

### 6.2 覆盖关系表达

对于同名条目，需要清楚表达：

- 最终哪个版本生效
- 哪些候选版本被覆盖
- 覆盖是因为名称冲突，而不是加载失败

UI 建议采用如下规则：

- 生效条目显示 `Active`
- 被更高优先级同名条目压住的显示 `Shadowed`
- 配置不合法或目标文件不存在的显示 `Invalid`

详情区中列出覆盖链，例如：

1. `project:codex` `skills/my-skill/SKILL.md` `Active`
2. `global:codex` `~/.codex/skills/my-skill/SKILL.md` `Shadowed`
3. `yaml:config.yaml` `skills[2]` `Shadowed`

## 7. 数据模型设计

为避免直接把底层 runtime 类型暴露给前端，Web UI 服务端增加一组面向页面的 ViewModel。

### 7.1 Skills ViewModel

```ts
interface SkillSourceView {
  name: string;
  description: string;
  sourceLabel: string;
  scope: "project" | "global" | "yaml";
  ideType: "cursor" | "claude" | "codex" | "kiro" | "config-yaml";
  path?: string;
  contentMode: "inline" | "file";
  editable: boolean;
  active: boolean;
  shadowedBy?: string;
  issues: string[];
}

interface SkillListItemView {
  name: string;
  description: string;
  activeSource: SkillSourceView;
  sourceCount: number;
  shadowedCount: number;
}

interface SkillDetailView {
  item: SkillListItemView;
  sources: SkillSourceView[];
  preview?: string;
}
```

### 7.2 MCP ViewModel

```ts
interface McpSourceView {
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  envKeys: string[];
  sourceLabel: string;
  scope: "project" | "global" | "yaml";
  ideType: "cursor" | "claude" | "codex" | "kiro" | "config-yaml";
  editable: boolean;
  active: boolean;
  shadowedBy?: string;
  issues: string[];
}

interface McpListItemView {
  name: string;
  activeSource: McpSourceView;
  status: "connected" | "failed" | "disconnected" | "unknown";
  toolCount: number | null;
  error?: string;
  sourceCount: number;
  shadowedCount: number;
}

interface McpDetailView {
  item: McpListItemView;
  sources: McpSourceView[];
}
```

### 7.3 编辑目标模型

编辑时不直接对“最终合并结果”写回，而是明确指定写入目标：

- `config.yaml`
- `.<ide>/mcp.json`
- `.<ide>/skills/<skill-name>/SKILL.md`

为此，服务端还需提供可写目标描述：

```ts
interface WritablePluginTarget {
  kind: "yaml-skill" | "ide-skill-file" | "yaml-mcp" | "ide-mcp-json";
  label: string;
  path: string;
  ideType?: "cursor" | "claude" | "codex" | "kiro";
}
```

## 8. 服务端设计

### 8.1 新增服务

新增两个服务类：

- `PluginDiscoveryService`
- `PluginConfigWriteService`

#### `PluginDiscoveryService`

职责：

- 调用 `discoverPluginConfig()` 扫描配置
- 重新扫描项目级目录，构造“同名但被覆盖”的来源列表
- 聚合 `SkillRegistry` 可读取的预览信息
- 聚合 `McpClientManager.getStatus()` 的连接状态
- 将结果转换为 UI ViewModel

注意点：

- `discoverPluginConfig()` 返回的是最终合并结果，无法直接提供所有被覆盖条目
- 因此该服务需要补做“分来源扫描 + 名称聚合”逻辑，保留被覆盖项用于 UI 展示
- 但扫描规则和路径选择仍应复用 `config-discovery.ts` 的规则，而不是自行定义另一套语义

#### `PluginConfigWriteService`

职责：

- 新增/更新/删除项目级 Skill
- 新增/更新/删除项目级 MCP server
- 保证写入时的原子性和最小破坏性
- 统一处理目录创建、文件命名、YAML/JSON 序列化

写入原则：

- Skill 优先写入项目级 `.<ide>/skills/<name>/SKILL.md`
- MCP 优先写入项目级 `.<ide>/mcp.json`
- 若用户明确选择写入 `config.yaml`，则写入该文件对应结构

### 8.2 新增 API 路由

建议新增以下路由：

#### Skills

- `GET /api/plugins/skills`
  - 返回 Skill 列表摘要
- `GET /api/plugins/skills/:name`
  - 返回单个 Skill 详情与来源列表
- `POST /api/plugins/skills`
  - 新增项目级 Skill
- `PUT /api/plugins/skills/:name`
  - 更新项目级 Skill
- `DELETE /api/plugins/skills/:name`
  - 删除项目级 Skill

#### MCP

- `GET /api/plugins/mcp`
  - 返回 MCP 列表摘要
- `GET /api/plugins/mcp/:name`
  - 返回单个 server 详情
- `POST /api/plugins/mcp`
  - 新增项目级 MCP server
- `PUT /api/plugins/mcp/:name`
  - 更新项目级 MCP server
- `DELETE /api/plugins/mcp/:name`
  - 删除项目级 MCP server
- `POST /api/plugins/mcp/:name/test`
  - 测试指定 server 配置是否合法并尝试连接

#### 来源与目标

- `GET /api/plugins/sources`
  - 返回当前项目支持的来源说明和可写目标列表

### 8.3 读写格式策略

#### Skill 写入格式

项目级 Skill 默认采用目录模式：

```text
.<ide>/skills/<skill-name>/SKILL.md
```

文件内容结构：

```md
---
name: my-skill
description: ...
---

...skill body...
```

优点：

- 与现有 skill 生态保持一致
- 后续可以自然扩展 `references/`、`scripts/` 等辅助文件
- 与 superpowers skill 目录结构兼容

#### MCP 写入格式

项目级 MCP 默认采用：

```json
{
  "mcpServers": {
    "my-server": {
      "transport": "stdio",
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

这样可与现有 `mcp.json` 解析逻辑完全对齐。

## 9. 客户端页面设计

### 9.1 Skills 页面交互

页面分四种主状态：

- 首次加载中
- 加载失败
- 空状态
- 正常列表

列表支持：

- 按名称搜索
- 按来源范围过滤
- 按是否项目级过滤
- 按是否被覆盖过滤

详情区中支持操作：

- 编辑项目级 Skill
- 复制为项目级 Skill
  - 适用于当前 active 条目来自 global/yaml，但用户想在项目中覆盖它
- 删除项目级 Skill
- 打开文档路径
  - 仅返回绝对路径，不在服务端执行 GUI 打开动作

Skill 编辑表单字段：

- `name`
- `description`
- `storageMode`
  - `skill-file`
  - `config-yaml-inline`，建议先隐藏为高级选项
- `body`

其中 `name` 新建后尽量不允许随意修改，避免引入“重命名 = 删除旧文件 + 新建新文件”的复杂语义。若后续支持重命名，应单独实现。

### 9.2 MCP 页面交互

列表支持：

- 按名称搜索
- 按 transport 过滤
- 按连接状态过滤
- 按来源范围过滤

详情区支持操作：

- 编辑项目级 server
- 复制为项目级 server
- 删除项目级 server
- 测试连接

MCP 编辑表单字段：

- `name`
- `transport`
- `command`
- `args`
- `url`
- `env`

表单规则：

- `stdio` 必须提供 `command`
- `sse` 必须提供 `url`
- `args` 在 UI 中以字符串数组或逐行输入表示
- `env` 在 UI 中以键值对编辑器表示，但值默认掩码展示，仅编辑时展开

### 9.3 与 Dashboard 的联动

Dashboard 后续可增加两个摘要卡片：

- Skills 数量
- MCP 连接健康度

但这不是本次功能的必要前置。第一阶段先完成独立页面即可。

## 10. 写入与安全策略

### 10.1 默认只写项目级目录

默认情况下，Web UI 禁止修改以下路径：

- `~/.codex/**`
- `~/.agents/**`
- `~/.skills-manager/**`
- 任何项目根目录之外的用户目录

原因：

- 全局目录通常承载用户个人偏好和跨项目配置
- Web UI 属于项目工具，不应默认拥有跨项目修改能力
- 减少误操作造成的不可见副作用

### 10.2 原子写入

所有写入采用“临时文件 + rename”策略，参考当前 `ConfigService` 的实现方式，避免部分写入导致配置文件损坏。

### 10.3 删除策略

删除项目级条目时：

- Skill 文件模式删除对应 `SKILL.md`，若目录为空则可一并删除目录
- MCP `mcp.json` 模式删除对应 `mcpServers[name]`

删除后，如果存在较低优先级同名条目，UI 应提示：

- “删除后将回退到全局/其他来源定义”

### 10.4 测试连接隔离

`POST /api/plugins/mcp/:name/test` 只做短生命周期连接测试：

- 创建临时 `McpClientManager`
- 尝试连接单个 server
- 收集状态与错误
- 立即断开

不要将该测试连接混入生产中的长期 runtime registry。

## 11. 错误处理

### 11.1 Skill 相关错误

- Skill frontmatter 缺失 `name`
- Skill 文档无法读取
- Skill 名称非法
- 项目级同名 Skill 写入目标冲突

UI 展示策略：

- 列表页显示 `Invalid`
- 详情区显示错误详情
- 编辑保存时在字段级或表单级展示错误

### 11.2 MCP 相关错误

- `stdio` 模式缺失 `command`
- `sse` 模式缺失 `url`
- JSON/YAML 序列化失败
- 环境变量引用未解析
- 连接失败、超时、权限问题

UI 展示策略：

- 列表页显示失败状态
- 详情区保留最近一次测试错误
- 测试连接时展示 loading 与结构化错误信息

## 12. 实施建议

建议分三阶段推进。

### Phase 1：只读可视化

目标：先把“看得见”做好。

内容：

- 新增 `Skills` 页面只读列表与详情
- 新增 `MCP` 页面只读列表与详情
- 展示来源、覆盖关系、连接状态
- 新增 `PluginDiscoveryService`

验收标准：

- 用户能知道最终有哪些 Skill 与 MCP 生效
- 用户能知道每个条目的来源
- 用户能知道同名覆盖关系

### Phase 2：项目级编辑

目标：让用户能在项目范围内增删改。

内容：

- 新增项目级 Skill 新建/编辑/删除
- 新增项目级 MCP server 新建/编辑/删除
- 新增 `PluginConfigWriteService`
- 编辑后自动重新拉取列表

验收标准：

- 用户可以不离开 Web UI 完成项目插件配置
- 写入结果与磁盘文件一致
- 刷新页面后结果仍正确

### Phase 3：连接测试与高级能力

目标：补足排障体验。

内容：

- MCP 测试连接
- 复制全局定义为项目级覆盖
- Skill 内容预览增强
- 更好的来源说明和优先级解释

验收标准：

- 用户能快速定位 MCP 连接失败原因
- 用户能方便地“继承并覆盖”全局配置

## 13. 对总体设计文档的影响

`docs/specs/winches-agent-design.md` 当前将 web-ui 描述为：

- 对话历史浏览
- 工具执行日志
- 定时任务管理
- 记忆管理
- 配置管理
- 系统状态

本设计落地后，建议将 Web UI 核心功能补充为：

- Skill 管理
- MCP 管理

这两项应作为 Web UI 的一等能力写入总体设计文档，而非仅作为“配置管理”的子项。

## 14. 推荐落地决策

综合现有代码结构与未来扩展性，推荐采用以下决策：

1. Skills 与 MCP 各自做独立页面，而不是并入 `Config` 页面。
2. 最终结果展示与来源/覆盖展示同时存在。
3. 只提供项目级写入，全局目录默认只读。
4. Skill 默认写入项目级 `.<ide>/skills/<name>/SKILL.md`。
5. MCP 默认写入项目级 `.<ide>/mcp.json`。
6. 测试连接使用临时 `McpClientManager`，不污染长期运行态。

## 15. 开发前置条件

在进入实现计划前，需要确认两件事：

1. 项目级默认 IDE 目录选择哪一个。
   建议默认使用 `/.codex/`，因为当前项目与 Codex skill 生态结合最深。

2. 是否允许通过 Web UI 创建 `config.yaml` 内联 Skill。
   建议第一阶段不开放，避免把 Skill 文档正文塞进 YAML，降低维护成本。

在这两个前提下，后续实现计划可以直接围绕：

- 路由与服务
- ViewModel
- 页面与表单
- 写入与测试
- 用例测试

展开。
