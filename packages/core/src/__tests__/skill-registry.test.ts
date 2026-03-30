import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../plugin/skill-registry.js";

describe("SkillRegistry", () => {
  it("loadAll 会保留 skill 文档内容和文档路径", async () => {
    const registry = new SkillRegistry();

    await registry.loadAll([
      {
        name: "create-agentsmd",
        description: "Create an AGENTS.md file",
        prompt: "Use cwd={{cwd}} and input={{input}}.",
        source: { ideType: "codex", path: "/tmp/skill/SKILL.md", scope: "global" },
      },
    ]);

    const skill = registry.get("create-agentsmd");

    expect(skill).toMatchObject({
      name: "create-agentsmd",
      content: "Use cwd={{cwd}} and input={{input}}.",
      prompt: "Use cwd={{cwd}} and input={{input}}.",
    });
    expect(skill?.documentPath).toBeUndefined();
    expect(registry.renderContent("create-agentsmd", { input: "draft" })).toContain("input=draft");
    expect(registry.renderPrompt("create-agentsmd", { input: "draft" })).toBe(
      registry.renderContent("create-agentsmd", { input: "draft" }),
    );
  });
});
