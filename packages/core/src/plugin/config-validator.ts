import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { McpServerConfig, SkillConfig, ValidationError } from "./types.js";

/** Skill name 合法字符正则：仅允许小写字母、数字和连字符 */
const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

/**
 * 验证原始插件配置，收集所有错误后批量返回。
 * 返回空数组表示验证通过。
 */
export function validatePluginConfig(
  config: { mcpServers?: McpServerConfig[]; skills?: SkillConfig[] },
  source: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (config.mcpServers) {
    for (let i = 0; i < config.mcpServers.length; i++) {
      errors.push(...validateMcpServer(config.mcpServers[i], i, source));
    }
  }

  if (config.skills) {
    for (let i = 0; i < config.skills.length; i++) {
      errors.push(...validateSkill(config.skills[i], i, source));
    }
    errors.push(...detectDuplicateSkillNames(config.skills, source));
  }

  return errors;
}

function validateMcpServer(
  server: McpServerConfig,
  index: number,
  source: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `mcpServers[${index}]`;

  if (!server.name) {
    errors.push({ path: `${prefix}.name`, message: "Missing required field 'name'", source });
  }

  if (!server.transport) {
    errors.push({
      path: `${prefix}.transport`,
      message: `Missing required field 'transport' for server "${server.name ?? `#${index}`}"`,
      source,
    });
  } else if (server.transport !== "stdio" && server.transport !== "sse") {
    errors.push({
      path: `${prefix}.transport`,
      message: `Invalid transport "${server.transport}" for server "${server.name ?? `#${index}`}". Must be "stdio" or "sse"`,
      source,
    });
  } else if (server.transport === "stdio" && !server.command) {
    errors.push({
      path: `${prefix}.command`,
      message: `Missing required field 'command' for stdio server "${server.name ?? `#${index}`}"`,
      source,
    });
  } else if (server.transport === "sse" && !server.url) {
    errors.push({
      path: `${prefix}.url`,
      message: `Missing required field 'url' for sse server "${server.name ?? `#${index}`}"`,
      source,
    });
  }

  return errors;
}

function validateSkill(skill: SkillConfig, index: number, source: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `skills[${index}]`;

  if (!skill.name) {
    errors.push({ path: `${prefix}.name`, message: "Missing required field 'name'", source });
  } else if (!SKILL_NAME_PATTERN.test(skill.name)) {
    errors.push({
      path: `${prefix}.name`,
      message: `Invalid skill name "${skill.name}". Only lowercase letters, numbers, and hyphens [a-z0-9-] are allowed`,
      source,
    });
  }

  if (skill.prompt && skill.promptFile) {
    errors.push({
      path: `${prefix}`,
      message: `Skill "${skill.name ?? `#${index}`}" has both 'prompt' and 'promptFile'. Only one is allowed`,
      source,
    });
  }

  if (skill.promptFile && !existsSync(resolve(skill.promptFile))) {
    errors.push({
      path: `${prefix}.promptFile`,
      message: `Skill "${skill.name ?? `#${index}`}" references non-existent promptFile: ${skill.promptFile}`,
      source,
    });
  }

  return errors;
}

function detectDuplicateSkillNames(skills: SkillConfig[], source: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < skills.length; i++) {
    const name = skills[i].name;
    if (!name) continue;

    const prev = seen.get(name);
    if (prev !== undefined) {
      errors.push({
        path: `skills[${i}].name`,
        message: `Duplicate skill name "${name}" (first defined at skills[${prev}])`,
        source,
      });
    } else {
      seen.set(name, i);
    }
  }

  return errors;
}
