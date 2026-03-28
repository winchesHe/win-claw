import os from "node:os";
import type { Message } from "@winches/ai";
import type { Memory } from "@winches/storage";
import { sanitizeToolName } from "@winches/core";
import type { SystemPromptParams } from "./types.js";

// ─── 内部区块构建器 ───────────────────────────────────────────

function buildIdentitySection(homeDir: string): string[] {
  return [
    "You are a helpful personal assistant with access to tools for file operations and shell commands.",
    "Always respond in 中文.",
    "Use tools when needed to complete tasks. Always explain what you're doing before using a tool.",
    "",
    `The user's home directory is: ${homeDir}`,
  ];
}

function buildToolingSection(params: SystemPromptParams): string[] {
  const { registry } = params;
  const tools = registry.list();
  if (tools.length === 0) return [];

  const lines: string[] = ["## Tooling", ""];

  // 按 dangerLevel 分组列出工具
  const safe = tools.filter((t) => t.dangerLevel === "safe");
  const confirm = tools.filter((t) => t.dangerLevel === "confirm");
  const dangerous = tools.filter((t) => t.dangerLevel === "dangerous");

  const formatTool = (t: { name: string; description: string }) =>
    `- \`${sanitizeToolName(t.name)}\`: ${t.description}`;

  if (safe.length > 0) {
    lines.push("Safe tools (execute immediately):");
    lines.push(...safe.map(formatTool));
    lines.push("");
  }
  if (confirm.length > 0) {
    lines.push("Tools requiring confirmation:");
    lines.push(...confirm.map(formatTool));
    lines.push("");
  }
  if (dangerous.length > 0) {
    lines.push("Dangerous tools (require explicit approval):");
    lines.push(...dangerous.map(formatTool));
    lines.push("");
  }

  return lines;
}

function buildToolCallStyleSection(): string[] {
  return [
    "## Tool Call Style",
    "",
    "- Before calling a tool, briefly explain what you intend to do and why.",
    "- If a tool call fails, do NOT retry with the same parameters. Try a different approach.",
    "- Do NOT use shell-exec for long-running or interactive processes.",
    "- When calling a tool, provide all required parameters as documented.",
  ];
}

function buildSkillsSection(params: {
  skillsPrompt?: string;
  readToolName: string;
}): string[] {
  const trimmed = params.skillsPrompt?.trim();
  if (!trimmed) return [];

  return [
    "",
    "## Skills (mandatory)",
    "",
    "Before replying: scan <available_skills> <description> entries.",
    `- If exactly one skill clearly applies: read its SKILL.md at <location> with \`${params.readToolName}\`, then follow it.`,
    "- If multiple could apply: choose the most specific one, then read/follow it.",
    "- If none clearly apply: do not read any SKILL.md.",
    "Constraints: never read more than one skill up front; only read after selecting.",
    "",
    trimmed,
  ];
}

function buildWorkspaceSection(params: SystemPromptParams): string[] {
  const cwd = params.cwd ?? process.cwd();
  const lines: string[] = ["", "## Workspace", "", `Working directory: ${cwd}`];

  if (params.workspaceGuidance) {
    lines.push("", params.workspaceGuidance);
  }
  if (params.workspaceNotes) {
    lines.push("", params.workspaceNotes);
  }

  return lines;
}

function buildAgentsMdSection(agentsMd?: string): string[] {
  const trimmed = agentsMd?.trim();
  if (!trimmed) return [];

  return [
    "",
    "## Agents.md",
    "",
    trimmed,
  ];
}

// ─── 公共 API ─────────────────────────────────────────────────

/**
 * 根据参数组装完整的 system prompt。
 *
 * 组成顺序：
 * 1. 身份（Identity）
 * 2. Tooling — 当前可用工具列表
 * 3. Tool Call Style — 工具调用风格说明
 * 4. Skills (mandatory) + <available_skills>
 * 5. Workspace — 工作目录、guidance、notes
 * 6. Agents.md — 项目级指导文档
 */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const homeDir = params.homeDir ?? os.homedir();
  const readToolName = params.readToolName ?? "file-read";

  const lines: string[] = [
    ...buildIdentitySection(homeDir),
    "",
    ...buildToolingSection(params),
    ...buildToolCallStyleSection(),
    ...buildSkillsSection({ skillsPrompt: params.skillsPrompt, readToolName }),
    ...buildWorkspaceSection(params),
    ...buildAgentsMdSection(params.agentsMd),
  ];

  return lines.join("\n");
}

/**
 * 构建发送给 LLM 的完整消息列表。
 *
 * 消息顺序：
 * 1. system 消息（systemPrompt + 可选记忆区块）
 * 2. 历史消息（来自 storage.getHistory）
 * 3. 当前用户消息（本次 chat 传入的 messages）
 *
 * 记忆注入格式（memories 非空时）：
 * <memory>
 * 记忆内容1
 * 记忆内容2
 * </memory>
 */
export function buildMessages(
  systemPrompt: string,
  memories: Memory[],
  history: Message[],
  currentMessages: Message[],
): Message[] {
  let systemContent = systemPrompt;

  if (memories.length > 0) {
    const memoryLines = memories.map((m) => m.content).join("\n");
    systemContent += `\n\n<memory>\n${memoryLines}\n</memory>`;
  }

  const systemMessage: Message = {
    role: "system",
    content: systemContent,
  };

  return [systemMessage, ...history, ...currentMessages];
}
