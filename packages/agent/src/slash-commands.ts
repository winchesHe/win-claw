import type { Skill, McpServerStatus, ISkillRegistry, IMcpClientManager } from "@winches/core";

export interface SlashCommandResult {
  handled: boolean;
  /** 需要注入的 system 消息（Skill 选择/读取指引） */
  systemMessage?: string;
  /** 需要作为用户消息发送的文本 */
  userMessage?: string;
  /** 直接返回给用户的响应（如 /mcp-status、/skills） */
  directResponse?: string;
}

function buildSkillExecutionMessage(skill: Skill): string {
  return [
    "## Selected Skill",
    `The user explicitly selected the skill \`${skill.name}\`.`,
    `Description: ${skill.description}`,
    `Read the skill document at \`${skill.source.path}\` with \`file-read\` before doing any substantive work.`,
    "Do not treat the skill content as already provided in the prompt.",
    "After reading it, follow the skill instructions and use the user's request as the task to complete.",
  ].join("\n");
}

export interface SlashCommandCompletion {
  command: string;
  description: string;
  type: "skill" | "builtin";
}

function formatMcpStatus(mcpClientManager: IMcpClientManager): string {
  const statuses: McpServerStatus[] = mcpClientManager.getStatus();
  if (statuses.length === 0) return "No MCP servers configured.";

  return statuses
    .map(
      (s) =>
        `${s.name}: ${s.status} (${s.toolCount} tools) [source: ${s.source.scope}:${s.source.ideType}]`,
    )
    .join("\n");
}

function formatSkillsList(skillRegistry: ISkillRegistry): string {
  const skills: Skill[] = skillRegistry.list();
  if (skills.length === 0) return "No skills registered.";

  return skills
    .map((s) => `/${s.name} — ${s.description} [source: ${s.source.scope}:${s.source.ideType}]`)
    .join("\n");
}

function formatHelpMessage(skillRegistry: ISkillRegistry): string {
  const lines: string[] = ["Available commands:"];

  lines.push("  /mcp-status — Show MCP server connection status");
  lines.push("  /skills — List all registered skills");

  const skills = skillRegistry.list();
  for (const skill of skills) {
    lines.push(`  /${skill.name} — ${skill.description}`);
  }

  return lines.join("\n");
}

export function handleSlashCommand(
  input: string,
  skillRegistry: ISkillRegistry,
  mcpClientManager: IMcpClientManager,
): SlashCommandResult {
  if (!input.startsWith("/")) return { handled: false };

  const trimmed = input.slice(1);
  const spaceIndex = trimmed.indexOf(" ");
  const command = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const argsText = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();

  if (command === "mcp-status") {
    return { handled: true, directResponse: formatMcpStatus(mcpClientManager) };
  }

  if (command === "skills") {
    return { handled: true, directResponse: formatSkillsList(skillRegistry) };
  }

  const skill = skillRegistry.get(command);
  if (skill) {
    return {
      handled: true,
      systemMessage: buildSkillExecutionMessage(skill),
      userMessage: argsText || `Use the ${command} skill for this request.`,
    };
  }

  return { handled: true, directResponse: formatHelpMessage(skillRegistry) };
}

export function getSlashCommandCompletions(
  skillRegistry: ISkillRegistry,
): SlashCommandCompletion[] {
  const completions: SlashCommandCompletion[] = skillRegistry.list().map((s) => ({
    command: s.name,
    description: s.description,
    type: "skill" as const,
  }));

  completions.push(
    { command: "mcp-status", description: "Show MCP server connection status", type: "builtin" },
    { command: "skills", description: "List all registered skills", type: "builtin" },
  );

  return completions;
}
