import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ConfigSource,
  IMcpClientManager,
  McpServerConfig,
  McpServerStatus,
  SkillConfig,
} from "@winches/core";
import { discoverPluginConfig } from "@winches/core";
import type {
  McpDetailView,
  McpListItemView,
  McpSourceView,
  PluginSourceSummaryView,
  PluginSourcesResponse,
  SkillDetailView,
  SkillListItemView,
  SkillSourceView,
  WritablePluginTarget,
} from "../types.js";

const IDE_TYPES = ["cursor", "claude", "codex", "kiro"] as const;

type SkillCandidate = SkillConfig & {
  path?: string;
  contentMode: "inline" | "file";
  issues: string[];
};
type McpCandidate = McpServerConfig & { path?: string; issues: string[] };

export class PluginDiscoveryService {
  constructor(
    private readonly rootDir: string,
    private readonly homeDir: string = homedir(),
    private readonly mcpClientManager?: IMcpClientManager,
  ) {}

  async listSkills(): Promise<SkillListItemView[]> {
    const details = await this.buildSkills();
    return details.map((detail) => detail.item);
  }

  async getSkill(name: string): Promise<SkillDetailView | null> {
    const details = await this.buildSkills();
    return details.find((detail) => detail.item.name === name) ?? null;
  }

  async listMcpServers(): Promise<McpListItemView[]> {
    const details = await this.buildMcpServers();
    return details.map((detail) => detail.item);
  }

  async getMcpServer(name: string): Promise<McpDetailView | null> {
    const details = await this.buildMcpServers();
    return details.find((detail) => detail.item.name === name) ?? null;
  }

  getSources(): PluginSourcesResponse {
    return {
      discoveredSources: this.buildDiscoveredSources(),
      writableTargets: this.buildWritableTargets(),
    };
  }

  private async buildSkills(): Promise<SkillDetailView[]> {
    const activeConfig = await discoverPluginConfig({
      projectRoot: this.rootDir,
      homeDir: this.homeDir,
      configYamlPath: resolve(this.rootDir, "config.yaml"),
    });
    const candidates = this.scanSkillCandidates();
    const activeByName = new Map<string, SkillConfig>(
      activeConfig.skills.map((skill: SkillConfig) => [skill.name, skill]),
    );
    const grouped = new Map<string, SkillCandidate[]>();

    for (const candidate of candidates) {
      const list = grouped.get(candidate.name) ?? [];
      list.push(candidate);
      grouped.set(candidate.name, list);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, sources]) => {
        const active = activeByName.get(name) ?? sources[0];
        const activeLabel = formatSourceLabel(active.source);
        const sourceViews = sources.map((source) =>
          toSkillSourceView(source, {
            activeLabel,
            isActive: isSameSkillSource(source, active),
          }),
        );
        const activeSource = sourceViews.find((source) => source.active) ?? sourceViews[0];
        const preview = readSkillPreview(active);

        return {
          item: {
            name,
            description: active.description,
            activeSource,
            sourceCount: sourceViews.length,
            shadowedCount: sourceViews.filter((source) => !source.active).length,
          },
          sources: sourceViews,
          preview,
        } satisfies SkillDetailView;
      });
  }

  private async buildMcpServers(): Promise<McpDetailView[]> {
    const activeConfig = await discoverPluginConfig({
      projectRoot: this.rootDir,
      homeDir: this.homeDir,
      configYamlPath: resolve(this.rootDir, "config.yaml"),
    });
    const candidates = this.scanMcpCandidates();
    const statuses = new Map<string, McpServerStatus>(
      (this.mcpClientManager?.getStatus() ?? []).map((status: McpServerStatus) => [
        status.name,
        status,
      ]),
    );
    const activeByName = new Map<string, McpServerConfig>(
      activeConfig.mcpServers.map((server: McpServerConfig) => [server.name, server]),
    );
    const grouped = new Map<string, McpCandidate[]>();

    for (const candidate of candidates) {
      const list = grouped.get(candidate.name) ?? [];
      list.push(candidate);
      grouped.set(candidate.name, list);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, sources]) => {
        const active = activeByName.get(name) ?? sources[0];
        const activeLabel = formatSourceLabel(active.source);
        const sourceViews = sources.map((source) =>
          toMcpSourceView(source, {
            activeLabel,
            isActive: isSameMcpSource(source, active),
          }),
        );
        const activeSource = sourceViews.find((source) => source.active) ?? sourceViews[0];
        const status = statuses.get(name);

        return {
          item: {
            name,
            activeSource,
            status: status?.status ?? "unknown",
            toolCount: status?.toolCount ?? null,
            error: status?.error,
            sourceCount: sourceViews.length,
            shadowedCount: sourceViews.filter((source) => !source.active).length,
          },
          sources: sourceViews,
        } satisfies McpDetailView;
      });
  }

  private scanSkillCandidates(): SkillCandidate[] {
    const results: SkillCandidate[] = [];

    for (const ideType of IDE_TYPES) {
      const projectDir = resolve(this.rootDir, `.${ideType}`, "skills");
      results.push(
        ...readSkillsDirectory(projectDir, { ideType, path: projectDir, scope: "project" }),
      );
    }

    for (const ideType of IDE_TYPES) {
      const globalDir = resolve(this.homeDir, `.${ideType}`, "skills");
      results.push(
        ...readSkillsDirectory(globalDir, { ideType, path: globalDir, scope: "global" }),
      );
    }

    results.push(
      ...readSkillsDirectory(resolve(this.homeDir, ".agents/skills"), {
        ideType: "claude",
        path: resolve(this.homeDir, ".agents/skills"),
        scope: "global",
      }),
    );
    results.push(
      ...readSkillsDirectory(resolve(this.homeDir, ".skills-manager/skills"), {
        ideType: "codex",
        path: resolve(this.homeDir, ".skills-manager/skills"),
        scope: "global",
      }),
    );
    results.push(
      ...readSkillsDirectory(resolve(this.homeDir, ".codex/superpowers/skills"), {
        ideType: "codex",
        path: resolve(this.homeDir, ".codex/superpowers/skills"),
        scope: "global",
      }),
    );

    const yamlPath = resolve(this.rootDir, "config.yaml");
    if (existsSync(yamlPath)) {
      results.push(...readSkillsFromConfigYaml(yamlPath));
    }

    return dedupeCandidates(results, (candidate) => `${candidate.name}:${candidate.source.path}`);
  }

  private scanMcpCandidates(): McpCandidate[] {
    const results: McpCandidate[] = [];

    for (const ideType of IDE_TYPES) {
      const projectPath = resolve(this.rootDir, `.${ideType}`, "mcp.json");
      results.push(...readMcpJson(projectPath, { ideType, path: projectPath, scope: "project" }));
    }

    for (const ideType of IDE_TYPES) {
      const globalPath = resolve(this.homeDir, `.${ideType}`, "mcp.json");
      results.push(...readMcpJson(globalPath, { ideType, path: globalPath, scope: "global" }));
    }

    const yamlPath = resolve(this.rootDir, "config.yaml");
    if (existsSync(yamlPath)) {
      results.push(...readMcpFromConfigYaml(yamlPath));
    }

    return dedupeCandidates(results, (candidate) => `${candidate.name}:${candidate.source.path}`);
  }

  private buildDiscoveredSources(): PluginSourceSummaryView[] {
    const sourceMap = new Map<string, PluginSourceSummaryView>();

    for (const source of [...this.scanSkillCandidates(), ...this.scanMcpCandidates()]) {
      const key = `${source.source.scope}:${source.source.ideType}:${source.source.path}`;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          sourceLabel: formatSourceLabel(source.source),
          scope: source.source.scope,
          ideType: source.source.ideType,
          path: source.source.path,
        });
      }
    }

    return Array.from(sourceMap.values()).sort((a, b) =>
      a.sourceLabel.localeCompare(b.sourceLabel),
    );
  }

  private buildWritableTargets(): WritablePluginTarget[] {
    const codexDir = resolve(this.rootDir, ".codex");
    return [
      {
        kind: "ide-skill-file",
        label: "Project Codex Skills",
        path: join(codexDir, "skills"),
        ideType: "codex",
      },
      {
        kind: "ide-mcp-json",
        label: "Project Codex MCP",
        path: join(codexDir, "mcp.json"),
        ideType: "codex",
      },
      {
        kind: "yaml-skill",
        label: "config.yaml skills",
        path: resolve(this.rootDir, "config.yaml"),
      },
      {
        kind: "yaml-mcp",
        label: "config.yaml mcp.servers",
        path: resolve(this.rootDir, "config.yaml"),
      },
    ];
  }
}

function toSkillSourceView(
  source: SkillCandidate,
  options: { activeLabel: string; isActive: boolean },
): SkillSourceView {
  return {
    name: source.name,
    description: source.description,
    sourceLabel: formatSourceLabel(source.source),
    scope: source.source.scope,
    ideType: source.source.ideType,
    path: source.path,
    contentMode: source.contentMode,
    editable: source.source.scope === "project",
    active: options.isActive,
    shadowedBy: options.isActive ? undefined : options.activeLabel,
    issues: source.issues,
  };
}

function toMcpSourceView(
  source: McpCandidate,
  options: { activeLabel: string; isActive: boolean },
): McpSourceView {
  return {
    name: source.name,
    transport: source.transport,
    command: source.command,
    args: source.args,
    url: source.url,
    envKeys: Object.keys(source.env ?? {}),
    env: source.env,
    sourceLabel: formatSourceLabel(source.source),
    scope: source.source.scope,
    ideType: source.source.ideType,
    editable: source.source.scope === "project",
    active: options.isActive,
    shadowedBy: options.isActive ? undefined : options.activeLabel,
    issues: source.issues,
  };
}

function formatSourceLabel(source: ConfigSource): string {
  return `${source.scope}:${source.ideType}`;
}

function isSameSkillSource(
  left: SkillCandidate | SkillConfig,
  right: SkillCandidate | SkillConfig,
): boolean {
  return (
    left.name === right.name &&
    left.source.path === right.source.path &&
    left.source.ideType === right.source.ideType
  );
}

function isSameMcpSource(
  left: McpCandidate | McpServerConfig,
  right: McpCandidate | McpServerConfig,
): boolean {
  return (
    left.name === right.name &&
    left.source.path === right.source.path &&
    left.source.ideType === right.source.ideType
  );
}

function readSkillPreview(skill: SkillCandidate | SkillConfig): string | undefined {
  if ("prompt" in skill && typeof skill.prompt === "string") {
    return skill.prompt.trim().slice(0, 400);
  }

  const path = "path" in skill ? skill.path : skill.promptFile;
  if (!path || !existsSync(path)) return undefined;
  return readFileSync(path, "utf-8").trim().slice(0, 400);
}

function readSkillsDirectory(baseDir: string, source: ConfigSource): SkillCandidate[] {
  if (!existsSync(baseDir)) return [];
  const entries = readdirSync(baseDir, { withFileTypes: true });
  const results: SkillCandidate[] = [];

  for (const entry of entries) {
    const entryPath = join(baseDir, entry.name);
    const skillPath = entry.isDirectory() ? join(entryPath, "SKILL.md") : entryPath;
    if (!skillPath.endsWith(".md") || !existsSync(skillPath)) continue;

    try {
      const raw = readFileSync(skillPath, "utf-8");
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!match) continue;
      const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
      const name = typeof frontmatter.name === "string" ? frontmatter.name : undefined;
      if (!name) continue;
      results.push({
        name,
        description: typeof frontmatter.description === "string" ? frontmatter.description : "",
        prompt: match[2].trim(),
        promptFile: skillPath,
        source,
        path: skillPath,
        contentMode: "file",
        issues: [],
      });
    } catch {
      // Skip unreadable skill files for now.
    }
  }

  return results;
}

function readSkillsFromConfigYaml(yamlPath: string): SkillCandidate[] {
  const raw = readFileSync(yamlPath, "utf-8");
  const doc = parseYaml(raw) as Record<string, unknown>;
  const source: ConfigSource = { ideType: "config-yaml", path: yamlPath, scope: "yaml" };
  const skills = Array.isArray(doc.skills) ? doc.skills : [];

  return skills.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const skill = entry as Record<string, unknown>;
    if (typeof skill.name !== "string") return [];
    return [
      {
        name: skill.name,
        description: typeof skill.description === "string" ? skill.description : "",
        prompt: typeof skill.prompt === "string" ? skill.prompt : undefined,
        promptFile: typeof skill.promptFile === "string" ? skill.promptFile : undefined,
        source,
        path: yamlPath,
        contentMode: typeof skill.promptFile === "string" ? "file" : "inline",
        issues: [],
      } satisfies SkillCandidate,
    ];
  });
}

function readMcpJson(filePath: string, source: ConfigSource): McpCandidate[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const mcpServers = (doc.mcpServers ?? {}) as Record<string, Record<string, unknown>>;

  return Object.entries(mcpServers).map(([name, value]) => ({
    name,
    transport: (value.transport as "stdio" | "sse") ?? "stdio",
    command: typeof value.command === "string" ? value.command : undefined,
    args: Array.isArray(value.args) ? (value.args as string[]) : undefined,
    env:
      typeof value.env === "object" && value.env
        ? (value.env as Record<string, string>)
        : undefined,
    url: typeof value.url === "string" ? value.url : undefined,
    source,
    path: filePath,
    issues: [],
  }));
}

function readMcpFromConfigYaml(yamlPath: string): McpCandidate[] {
  const raw = readFileSync(yamlPath, "utf-8");
  const doc = parseYaml(raw) as Record<string, unknown>;
  const source: ConfigSource = { ideType: "config-yaml", path: yamlPath, scope: "yaml" };
  const mcp = (doc.mcp ?? {}) as Record<string, unknown>;
  const servers = (mcp.servers ?? {}) as Record<string, Record<string, unknown>>;

  return Object.entries(servers).map(([name, value]) => ({
    name,
    transport: (value.transport as "stdio" | "sse") ?? "stdio",
    command: typeof value.command === "string" ? value.command : undefined,
    args: Array.isArray(value.args) ? (value.args as string[]) : undefined,
    env:
      typeof value.env === "object" && value.env
        ? (value.env as Record<string, string>)
        : undefined,
    url: typeof value.url === "string" ? value.url : undefined,
    source,
    path: yamlPath,
    issues: [],
  }));
}

function dedupeCandidates<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
