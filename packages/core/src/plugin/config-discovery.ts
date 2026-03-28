import { readFileSync, existsSync, readdirSync, type Dirent } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import pino from "pino";
import type {
  ConfigDiscoveryOptions,
  PluginConfig,
  McpServerConfig,
  SkillConfig,
  ConfigSource,
  IdeType,
} from "./types.js";
import { validatePluginConfig } from "./config-validator.js";

const logger = pino({ name: "@winches/core:plugin" });

const IDE_TYPES: IdeType[] = ["cursor", "claude", "codex", "kiro"];

const EXTRA_GLOBAL_SKILL_DIRS = [
  { baseDir: ".agents/skills", ideType: "claude" as const },
  { baseDir: ".skills-manager/skills", ideType: "codex" as const },
  { baseDir: ".codex/superpowers/skills", ideType: "codex" as const },
];

/**
 * 发现并合并插件配置。
 *
 * 扫描顺序（优先级从高到低）：
 * 1. 项目级 IDE 目录（.cursor / .claude / .codex / .kiro）
 * 2. 全局 IDE 目录（仅当同名 IDE 在项目级未找到时）
 * 3. config.yaml（最低优先级）
 *
 * 同名 MCP Server 或 Skill 以高优先级为准。
 */
export async function discoverPluginConfig(
  options?: ConfigDiscoveryOptions,
): Promise<PluginConfig> {
  const projectRoot = options?.projectRoot ?? process.cwd();
  const home = options?.homeDir ?? homedir();
  const configYamlPath = options?.configYamlPath;

  const mcpServers = new Map<string, McpServerConfig>();
  const skills = new Map<string, SkillConfig>();
  const sourceSummary: string[] = [];
  // 1. Scan project-local IDE dirs (highest priority)
  for (const ide of IDE_TYPES) {
    const dir = resolve(projectRoot, `.${ide}`);
    if (!existsSync(dir)) continue;
    const source: ConfigSource = { ideType: ide, path: dir, scope: "project" };
    loadFromIdeDir(dir, source, mcpServers, skills, sourceSummary);
  }

  // 2. Scan global IDE dirs (lower priority; same-name entries won't override project-level)
  for (const ide of IDE_TYPES) {
    const dir = resolve(home, `.${ide}`);
    if (!existsSync(dir)) continue;
    const source: ConfigSource = { ideType: ide, path: dir, scope: "global" };
    loadFromIdeDir(dir, source, mcpServers, skills, sourceSummary);
  }

  // 2.5. Scan additional global skill directories used by local skill managers.
  for (const extra of EXTRA_GLOBAL_SKILL_DIRS) {
    const dir = resolve(home, extra.baseDir);
    if (!existsSync(dir)) continue;
    const source: ConfigSource = { ideType: extra.ideType, path: dir, scope: "global" };
    loadFromSkillsDir(dir, source, skills, sourceSummary);
  }

  // 3. Load from config.yaml (lowest priority)
  const yamlPath = configYamlPath ?? resolve(projectRoot, "config.yaml");
  if (existsSync(yamlPath)) {
    loadFromConfigYaml(yamlPath, mcpServers, skills, sourceSummary);
  }

  const result: PluginConfig = {
    mcpServers: Array.from(mcpServers.values()),
    skills: Array.from(skills.values()),
    sourceSummary,
  };

  if (sourceSummary.length > 0) {
    logger.info({ sources: sourceSummary }, "Plugin config discovered");
  }

  return result;
}

function loadFromSkillsDir(
  skillsDir: string,
  source: ConfigSource,
  skills: Map<string, SkillConfig>,
  summary: string[],
): void {
  const parsed = parseSkillsDir(skillsDir, source);
  for (const sk of parsed) {
    if (!skills.has(sk.name)) {
      skills.set(sk.name, sk);
    }
  }
  if (parsed.length > 0) {
    summary.push(`${source.scope}:${source.ideType}:${skillsDir} (${parsed.length} skills)`);
  }

  const skillList = Array.from(skills.values()).filter((s) => s.source === source);
  const errors = validatePluginConfig({ skills: skillList }, `${source.scope}:${source.ideType}`);
  for (const err of errors) {
    logger.warn({ path: err.path, source: err.source }, err.message);
  }
}

// ---------------------------------------------------------------------------
// IDE directory loader
// ---------------------------------------------------------------------------

function loadFromIdeDir(
  dir: string,
  source: ConfigSource,
  mcpServers: Map<string, McpServerConfig>,
  skills: Map<string, SkillConfig>,
  summary: string[],
): void {
  const mcpJsonPath = join(dir, "mcp.json");
  if (existsSync(mcpJsonPath)) {
    const servers = parseMcpJson(mcpJsonPath, source);
    for (const s of servers) {
      if (!mcpServers.has(s.name)) {
        mcpServers.set(s.name, s);
      }
    }
    if (servers.length > 0) {
      summary.push(`${source.scope}:${source.ideType}:mcp.json (${servers.length} servers)`);
    }
  }

  const skillsDir = join(dir, "skills");
  if (existsSync(skillsDir)) {
    const parsed = parseSkillsDir(skillsDir, source);
    for (const sk of parsed) {
      if (!skills.has(sk.name)) {
        skills.set(sk.name, sk);
      }
    }
    if (parsed.length > 0) {
      summary.push(`${source.scope}:${source.ideType}:skills/ (${parsed.length} skills)`);
    }
  }

  // Run validation and log warnings (non-blocking)
  const servers = Array.from(mcpServers.values()).filter((s) => s.source === source);
  const skillList = Array.from(skills.values()).filter((s) => s.source === source);
  const errors = validatePluginConfig(
    { mcpServers: servers, skills: skillList },
    `${source.scope}:${source.ideType}`,
  );
  for (const err of errors) {
    logger.warn({ path: err.path, source: err.source }, err.message);
  }
}

// ---------------------------------------------------------------------------
// config.yaml loader
// ---------------------------------------------------------------------------

function loadFromConfigYaml(
  yamlPath: string,
  mcpServers: Map<string, McpServerConfig>,
  skills: Map<string, SkillConfig>,
  summary: string[],
): void {
  let raw: string;
  try {
    raw = readFileSync(yamlPath, "utf-8");
  } catch {
    return;
  }

  let doc: Record<string, unknown>;
  try {
    doc = parseYaml(raw) as Record<string, unknown>;
  } catch (e) {
    logger.warn({ path: yamlPath, error: String(e) }, "Failed to parse config.yaml");
    return;
  }

  if (!doc || typeof doc !== "object") return;

  const source: ConfigSource = { ideType: "config-yaml", path: yamlPath, scope: "yaml" };

  // mcp.servers
  const mcp = doc.mcp as Record<string, unknown> | undefined;
  if (mcp && typeof mcp === "object") {
    const servers = mcp.servers as Record<string, unknown> | undefined;
    if (servers && typeof servers === "object") {
      const parsed = convertMcpServersObject(
        servers as Record<string, Record<string, unknown>>,
        source,
      );
      let count = 0;
      for (const s of parsed) {
        if (!mcpServers.has(s.name)) {
          mcpServers.set(s.name, s);
          count++;
        }
      }
      if (count > 0) {
        summary.push(`config.yaml:mcp.servers (${count} servers)`);
      }
    }
  }

  // skills
  const rawSkills = doc.skills as unknown[] | undefined;
  if (Array.isArray(rawSkills)) {
    let count = 0;
    for (const entry of rawSkills) {
      if (!entry || typeof entry !== "object") continue;
      const sk = entry as Record<string, unknown>;
      const name = sk.name as string | undefined;
      if (!name) continue;
      if (skills.has(name)) continue;

      const skill: SkillConfig = {
        name,
        description: (sk.description as string) ?? "",
        source,
      };
      if (sk.prompt) skill.prompt = sk.prompt as string;
      if (sk.promptFile) skill.promptFile = sk.promptFile as string;

      skills.set(name, skill);
      count++;
    }
    if (count > 0) {
      summary.push(`config.yaml:skills (${count} skills)`);
    }
  }

  // Validate config.yaml entries
  const yamlServers = Array.from(mcpServers.values()).filter((s) => s.source === source);
  const yamlSkills = Array.from(skills.values()).filter((s) => s.source === source);
  const errors = validatePluginConfig(
    { mcpServers: yamlServers, skills: yamlSkills },
    "config-yaml",
  );
  for (const err of errors) {
    logger.warn({ path: err.path, source: err.source }, err.message);
  }
}

// ---------------------------------------------------------------------------
// mcp.json parser
// ---------------------------------------------------------------------------

function parseMcpJson(filePath: string, source: ConfigSource): McpServerConfig[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    logger.warn({ path: filePath, error: String(e) }, "Failed to parse mcp.json");
    return [];
  }

  const mcpServers = doc.mcpServers as Record<string, Record<string, unknown>> | undefined;
  if (!mcpServers || typeof mcpServers !== "object") return [];

  return convertMcpServersObject(mcpServers, source);
}

// ---------------------------------------------------------------------------
// Shared MCP servers object converter (used by mcp.json and config.yaml)
// ---------------------------------------------------------------------------

function convertMcpServersObject(
  servers: Record<string, Record<string, unknown>>,
  source: ConfigSource,
): McpServerConfig[] {
  const result: McpServerConfig[] = [];

  for (const [name, value] of Object.entries(servers)) {
    if (!value || typeof value !== "object") continue;

    const config: McpServerConfig = {
      name,
      transport: (value.transport as McpServerConfig["transport"]) ?? "stdio",
      source,
    };

    if (value.command) config.command = value.command as string;
    if (value.args) config.args = value.args as string[];
    if (value.env) config.env = value.env as Record<string, string>;
    if (value.url) config.url = value.url as string;

    replaceEnvVarsInConfig(config);
    result.push(config);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Skills directory parser
// ---------------------------------------------------------------------------

function parseSkillsDir(dir: string, source: ConfigSource): SkillConfig[] {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent<string>[];
  } catch {
    return [];
  }

  const results: SkillConfig[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);

    // 子目录模式：skills/<name>/SKILL.md
    if (entry.isDirectory()) {
      const skillFile = join(entryPath, "SKILL.md");
      if (existsSync(skillFile)) {
        try {
          const raw = readFileSync(skillFile, "utf-8");
          const skill = parseSkillMarkdown(raw, skillFile, source);
          if (skill) results.push(skill);
        } catch {
          /* skip unreadable */
        }
      }
      continue;
    }

    // 平面模式：skills/<name>.md
    if (entry.name.endsWith(".md")) {
      try {
        const raw = readFileSync(entryPath, "utf-8");
        const skill = parseSkillMarkdown(raw, entryPath, source);
        if (skill) results.push(skill);
      } catch {
        /* skip unreadable */
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Skill markdown frontmatter parser
// ---------------------------------------------------------------------------

function parseSkillMarkdown(
  raw: string,
  filePath: string,
  source: ConfigSource,
): SkillConfig | null {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    logger.warn({ path: filePath }, "Skill file missing YAML frontmatter");
    return null;
  }

  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseYaml(fmMatch[1]) as Record<string, unknown>;
  } catch (e) {
    logger.warn({ path: filePath, error: String(e) }, "Failed to parse skill frontmatter");
    return null;
  }

  if (!frontmatter || typeof frontmatter !== "object") return null;

  const name = frontmatter.name as string | undefined;
  if (!name) {
    logger.warn({ path: filePath }, "Skill file missing 'name' in frontmatter");
    return null;
  }

  const skill: SkillConfig = {
    name,
    description: (frontmatter.description as string) ?? "",
    source,
  };

  if (frontmatter.promptFile) {
    skill.promptFile = frontmatter.promptFile as string;
  } else {
    const body = fmMatch[2].trim();
    if (body) skill.prompt = body;
  }

  return skill;
}

// ---------------------------------------------------------------------------
// Environment variable substitution
// ---------------------------------------------------------------------------

const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

function replaceEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (match, varName: string) => {
    const envValue = process.env[varName];
    return envValue !== undefined ? envValue : match;
  });
}

function replaceEnvVarsInConfig(config: McpServerConfig): void {
  if (config.command) {
    config.command = replaceEnvVars(config.command);
  }

  if (config.args) {
    config.args = config.args.map(replaceEnvVars);
  }

  if (config.url) {
    config.url = replaceEnvVars(config.url);
  }

  if (config.env) {
    const replaced: Record<string, string> = {};
    for (const [key, val] of Object.entries(config.env)) {
      replaced[key] = replaceEnvVars(val);
    }
    config.env = replaced;
  }
}
