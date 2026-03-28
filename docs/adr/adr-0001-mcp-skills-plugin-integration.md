---
title: "ADR-0001: MCP/Skills 插件集成架构"
status: "Proposed"
date: "2026-03-27"
authors: "winches-agent 核心开发者"
tags: ["architecture", "decision", "mcp", "skills", "plugin"]
supersedes: ""
superseded_by: ""
---

# ADR-0001: MCP/Skills 插件集成架构

## Status

**Proposed** | Accepted | Rejected | Superseded | Deprecated

## Context

winches-agent 需要支持 MCP（Model Context Protocol）服务器和 Skills（预定义提示词模板）的插件式集成，以扩展 Agent 的工具能力和交互模式。核心挑战包括：

1. 配置来源多样性：用户可能在不同 IDE 配置目录（.cursor、.claude、.codex、.kiro）中维护 MCP/Skills 配置，需要兼容多种 IDE 的配置习惯
2. 配置优先级：项目本地配置应优先于用户全局配置，类似 Claude Code 的行为
3. 模块归属：MCP/Skills 功能需要合理地放置在现有 monorepo 包结构中，遵循单向依赖原则
4. MCP 工具与内置工具的统一管理：MCP Server 暴露的工具需要无缝融入现有的 ToolRegistry 体系
5. Skill 的交互模式：需要决定 Skill 是作为工具注册还是作为提示词注入
6. MCP 工具的安全级别：需要决定外部 MCP 工具的默认权限模型

## Decision

### 决策 1：新增模块而非新包

MCP/Skills 功能放在 `@winches/core` 包的 `plugin/` 子目录中，Slash Command 处理逻辑放在 `@winches/agent` 中。不创建独立的 `@winches/plugin` 包。

理由：MCP 工具适配本质上是 ToolRegistry 的扩展，Skill 注册表与工具注册表同层级。新增独立包会引入不必要的包间依赖复杂度，且功能量不足以支撑独立包的维护成本。

### 决策 2：多目录配置发现与优先级合并

采用项目本地 → 用户全局 → config.yaml 的三层配置发现策略，扫描顺序为 `.cursor` > `.claude` > `.codex` > `.kiro`。同一 IDE 在项目本地存在时，忽略该 IDE 的全局配置。同名条目按优先级覆盖。

理由：兼容主流 AI IDE 的配置习惯，用户无需为 winches-agent 单独维护配置文件，可直接复用已有的 IDE 配置。

### 决策 3：使用 @modelcontextprotocol/sdk 官方 SDK

MCP 协议实现使用官方 TypeScript SDK，支持 stdio 和 SSE 两种传输方式。

理由：MCP 协议规范复杂，官方 SDK 维护活跃且覆盖完整，自行实现成本高且容易出现兼容性问题。

### 决策 4：Skill 作为提示词注入而非工具

Skill 不注册为 Tool，而是通过 Slash Command 触发后将提示词注入到对话上下文的 system 消息中。

理由：Skill 的语义是"预定义提示词模板"，不是可执行的工具。将其注册为 Tool 会污染工具列表，增加 LLM 的选择负担，且 Skill 的调用时机应由用户显式控制（通过 `/` 命令），而非由 LLM 自主决定。

### 决策 5：MCP 工具默认安全级别为 safe

所有 MCP 工具的 `dangerLevel` 默认设置为 `safe`，Agent 可直接调用无需用户确认。

理由：MCP Server 通常由用户自行配置和信任，频繁的确认弹窗会严重影响使用体验。用户选择加载某个 MCP Server 本身就是一种信任声明。

### 决策 6：/skills 统一承担帮助和列表功能

移除独立的 `/help` 命令，由 `/skills` 同时承担 Skill 列表展示和帮助功能。新增 `/` 输入时的下拉补全提示。

理由：`/help` 和 `/skills` 功能高度重叠，合并后减少用户认知负担。下拉补全提供了更好的发现性，用户无需记忆命令名称。

## Consequences

### Positive

- **POS-001**: 兼容 Cursor、Claude Code、Codex、Kiro 四种 IDE 的配置格式，用户零迁移成本
- **POS-002**: 模块内聚在现有包中，不增加 monorepo 的包数量和依赖复杂度
- **POS-003**: MCP 工具通过 ToolRegistry 统一管理，LLM 可像使用内置工具一样调用外部工具
- **POS-004**: Skill 提示词注入模式保持工具列表干净，不增加 LLM 的工具选择负担
- **POS-005**: 官方 MCP SDK 确保协议兼容性，降低维护成本
- **POS-006**: safe 默认安全级别提供流畅的使用体验，减少交互中断
- **POS-007**: `/` 下拉补全提升命令发现性，降低学习曲线

### Negative

- **NEG-001**: 多目录扫描增加启动时间（需扫描最多 9 个配置源），但可通过并行扫描和缓存优化
- **NEG-002**: `@winches/core` 包体积增大，引入 `@modelcontextprotocol/sdk` 依赖
- **NEG-003**: MCP 工具默认 safe 级别存在安全风险，恶意 MCP Server 可能执行危险操作
- **NEG-004**: 不同 IDE 的配置格式可能存在细微差异，需要持续维护适配逻辑
- **NEG-005**: Skill 作为提示词注入意味着无法被 LLM 自主调用，限制了自动化场景

## Alternatives Considered

### 创建独立的 @winches/plugin 包

- **ALT-001**: **Description**: 将所有 MCP/Skills 功能放在独立的 `@winches/plugin` 包中，作为 `@winches/core` 和 `@winches/agent` 之间的中间层
- **ALT-002**: **Rejection Reason**: 功能量不足以支撑独立包，且会在依赖链中引入额外层级（core → plugin → agent），增加构建和测试复杂度

### 仅从 config.yaml 读取配置

- **ALT-003**: **Description**: 所有 MCP/Skills 配置统一在 config.yaml 中声明，不扫描 IDE 配置目录
- **ALT-004**: **Rejection Reason**: 用户需要手动将 IDE 配置复制到 config.yaml，增加维护负担，且无法自动同步 IDE 配置变更

### Skill 注册为 Tool

- **ALT-005**: **Description**: 将每个 Skill 注册为一个 Tool，LLM 可自主决定何时调用
- **ALT-006**: **Rejection Reason**: Skill 本质是提示词模板而非可执行操作，注册为 Tool 会污染工具列表，且 LLM 可能在不恰当的时机自动调用 Skill

### MCP 工具默认 confirm 级别

- **ALT-007**: **Description**: 所有 MCP 工具默认需要用户确认才能执行
- **ALT-008**: **Rejection Reason**: 频繁的确认弹窗严重影响使用体验，用户配置 MCP Server 本身即为信任声明

### 自行实现 MCP 协议

- **ALT-009**: **Description**: 不使用官方 SDK，自行实现 MCP 协议的 stdio 和 SSE 传输层
- **ALT-010**: **Rejection Reason**: MCP 协议规范复杂（JSON-RPC 2.0 + 多种传输方式 + 能力协商），自行实现成本高且难以保证兼容性

## Implementation Notes

- **IMP-001**: 配置发现引擎（ConfigDiscovery）与连接管理（McpClientManager）职责分离，便于独立测试和替换
- **IMP-002**: 实现顺序为自底向上：类型定义 → 配置验证 → 配置发现 → MCP 适配 → MCP 客户端 → Skill 注册 → Slash Command → Agent 集成
- **IMP-003**: 15 个正确性属性通过 fast-check 属性测试验证，覆盖配置合并优先级、工具适配不变量、模板变量替换等核心行为
- **IMP-004**: MCP Server 连接采用逐一连接策略，单个失败不影响其余，确保部分可用性
- **IMP-005**: 宿主程序（TUI/Gateway）负责调用 `getSlashCommandCompletions` 实现 `/` 输入时的下拉补全 UI

## References

- **REF-001**: `.kiro/specs/mcp-skills-integration/requirements.md` — 需求文档（9 个需求）
- **REF-002**: `.kiro/specs/mcp-skills-integration/design.md` — 设计文档（6 个组件、15 个正确性属性）
- **REF-003**: `.kiro/specs/mcp-skills-integration/tasks.md` — 实现计划（13 个顶层任务）
- **REF-004**: [Model Context Protocol Specification](https://modelcontextprotocol.io/specification)
- **REF-005**: `docs/specs/2026-03-23-winches-agent-design.md` — winches-agent 整体设计文档
