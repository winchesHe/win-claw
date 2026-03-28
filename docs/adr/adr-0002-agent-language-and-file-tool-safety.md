---
title: "ADR-0002: Agent 默认中文响应与文件工具安全分级调整"
status: "Proposed"
date: "2026-03-28"
authors: "winches-agent 核心开发者"
tags: ["architecture", "decision", "agent", "prompt", "tooling", "safety"]
supersedes: ""
superseded_by: ""
---

# ADR-0002: Agent 默认中文响应与文件工具安全分级调整

## Status

**Proposed** | Accepted | Rejected | Superseded | Deprecated

## Context

当前 winches-agent 在两个用户体验层面存在不一致和额外摩擦：

1. Agent 默认回复语言未被强约束，实际输出可能随模型偏好、上下文语言或上游 provider 行为在中英文之间漂移，导致终端交互风格不稳定。
2. 文件工具的安全分级偏保守，`file.write` 和 `file.move` 被标记为需要确认，导致常规编辑与整理工作频繁弹出审批；而从用户意图看，真正需要显式确认的高风险文件操作主要是不可逆删除。
3. TUI 是高频交互界面，审批次数直接影响使用流畅度。若日常写入、移动文件都触发确认，Agent 的可用性会明显下降。
4. 当前项目已具备工具级 `dangerLevel` 模型，可用较小改动精确调整风险边界，无需引入新权限系统。

## Decision

采用以下两项组合决策，以统一语言输出并降低日常文件操作的交互摩擦：

- **DEC-001**: 在默认 system prompt 的身份区块中加入 `Always respond in 中文.`，将中文设为 Agent 的默认回复语言。
- **DEC-002**: 将 `file.write` 和 `file.move` 的 `dangerLevel` 从 `confirm` 调整为 `safe`，保留 `file.delete` 为需要显式确认的高风险操作。

选择该方案的原因：

- **DEC-003**: 语言约束放在默认 system prompt 中，能够覆盖 TUI/Gateway 等所有宿主程序，不依赖调用方重复配置。
- **DEC-004**: 文件写入和移动通常是可预期、可恢复、且构成日常主路径操作；删除则具备更高不可逆性，应继续保留确认门槛。
- **DEC-005**: 该方案只调整现有 prompt 和工具注册元数据，不改变 Agent 主循环、审批协议或宿主程序 UI，实施成本低且回归面可控。

## Consequences

### Positive

- **POS-001**: Agent 的默认输出语言在不同 provider 和上下文下更稳定，终端交互体验更一致。
- **POS-002**: 常规文件创建、覆盖和移动操作不再频繁弹出审批，显著降低高频任务阻塞。
- **POS-003**: 风险边界更贴近真实操作语义，将显式确认聚焦在删除这类不可逆动作上。
- **POS-004**: 改动面集中在 prompt 生成与文件工具元数据，便于测试、回滚和后续迭代。

### Negative

- **NEG-001**: 默认中文响应可能与少数英文工作流不一致，调用方若需要英文需额外在上下文中覆盖说明。
- **NEG-002**: `file.write` 设为 `safe` 后，错误写入将不再经过人工二次确认，对 prompt 质量与工具调用准确性提出更高要求。
- **NEG-003**: `file.move` 设为 `safe` 后，批量整理类操作的误移动风险上升，需依赖更好的计划说明和测试保障。

## Alternatives Considered

### 保持现状

- **ALT-001**: **Description**: 不增加默认中文约束，保留 `file.write` / `file.move` 的 `confirm` 分级。
- **ALT-002**: **Rejection Reason**: 无法解决输出语言漂移与审批过多的问题，持续影响 TUI 高频使用体验。

### 仅调整语言，不调整文件工具权限

- **ALT-003**: **Description**: 只在 system prompt 中强制中文，保留当前文件工具确认策略。
- **ALT-004**: **Rejection Reason**: 只能改善语言一致性，无法解决日常文件操作被频繁审批打断的主路径问题。

### 所有文件修改操作都保持确认

- **ALT-005**: **Description**: 将写入、移动、删除统一视为高风险，全部要求确认。
- **ALT-006**: **Rejection Reason**: 风险控制最强，但会显著降低 Agent 的执行效率，与 TUI 的快速交互目标不符。

### 将所有文件工具都设为 safe

- **ALT-007**: **Description**: 包括 `file.delete` 在内的所有文件工具都直接执行，不再审批。
- **ALT-008**: **Rejection Reason**: 删除具备明显不可逆性，完全移除确认门槛会引入过高的数据丢失风险。

## Implementation Notes

- **IMP-001**: 在 `packages/agent/src/prompt.ts` 的身份区块中加入默认中文回复约束。
- **IMP-002**: 在 `packages/core/src/tools/file.ts` 中将 `file.write` 与 `file.move` 的 `dangerLevel` 调整为 `safe`，保留 `file.delete` 为高风险级别。
- **IMP-003**: 通过 `packages/agent/src/__tests__/prompt.test.ts` 验证默认中文约束已进入 system prompt，并通过 `loop.test.ts` 回归检查确认对 slash skill 路径无行为回退。

## References

- **REF-001**: [packages/agent/src/prompt.ts](/Users/moego-winches/Desktop/Company/AI-Agent/win-claw/packages/agent/src/prompt.ts) — 默认 system prompt 生成逻辑
- **REF-002**: [packages/core/src/tools/file.ts](/Users/moego-winches/Desktop/Company/AI-Agent/win-claw/packages/core/src/tools/file.ts) — 文件工具定义与安全分级
- **REF-003**: [docs/adr/adr-0001-mcp-skills-plugin-integration.md](/Users/moego-winches/Desktop/Company/AI-Agent/win-claw/docs/adr/adr-0001-mcp-skills-plugin-integration.md) — 插件与 slash skill 集成 ADR
