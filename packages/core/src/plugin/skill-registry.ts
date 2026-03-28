import { readFileSync } from "node:fs";
import { platform } from "node:os";
import pino from "pino";
import type { Skill, SkillConfig } from "./types.js";

const logger = pino({ name: "@winches/core:plugin" });

const TEMPLATE_VAR_PATTERN = /\{\{(\w+)\}\}/g;

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  /** 批量加载 Skill 定义。promptFile 模式下读取文件内容。 */
  async loadAll(configs: SkillConfig[]): Promise<void> {
    for (const config of configs) {
      let prompt: string;

      if (config.promptFile) {
        try {
          prompt = readFileSync(config.promptFile, "utf-8");
        } catch (err) {
          logger.warn(
            { skill: config.name, promptFile: config.promptFile, error: String(err) },
            "Failed to read skill promptFile, skipping",
          );
          continue;
        }
      } else if (config.prompt) {
        prompt = config.prompt;
      } else {
        logger.warn({ skill: config.name }, "Skill has neither prompt nor promptFile, skipping");
        continue;
      }

      const skill: Skill = {
        name: config.name,
        description: config.description,
        prompt,
        source: config.source,
      };

      this.skills.set(config.name, skill);
    }
  }

  /** 按名称查找 Skill */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /** 列出所有已注册的 Skill */
  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 渲染 Skill 提示词，替换模板变量。
   *
   * 内置变量：
   * - {{cwd}} → process.cwd()
   * - {{os}} → process.platform
   * - {{date}} → 当前日期 ISO 字符串
   * - {{input}} → 从 variables 参数传入
   *
   * 未定义变量保留原始占位符，记录 debug 日志。
   */
  renderPrompt(name: string, variables?: Record<string, string>): string | undefined {
    const skill = this.skills.get(name);
    if (!skill) return undefined;

    const builtins: Record<string, string> = {
      cwd: process.cwd(),
      os: platform(),
      date: new Date().toISOString(),
    };

    const allVars = { ...builtins, ...variables };

    return skill.prompt.replace(TEMPLATE_VAR_PATTERN, (match, varName: string) => {
      const value = allVars[varName];
      if (value !== undefined) return value;
      logger.debug(
        { skill: name, variable: varName },
        "Undefined template variable, keeping placeholder",
      );
      return match;
    });
  }
}
