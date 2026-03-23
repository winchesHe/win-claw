#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { render } from "ink";
import { loadConfig, TuiConfigError } from "./config.js";
import { App } from "./app.js";
import { createAIClient } from "@winches/ai";
import {
  openDatabase,
  MigrationRunner,
  EmbeddingService,
  SqliteStorageService,
  StorageConfigLoader,
} from "@winches/storage";
import type { StorageService } from "@winches/storage";
import type { LLMProvider } from "@winches/ai";
import { Agent } from "@winches/agent";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 向上查找文件，最多 6 层 */
function findFile(filename: string): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, filename);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 向上查找并加载 .env，已有的环境变量不覆盖 */
function loadDotEnv(): void {
  const envPath = findFile(".env");
  if (!envPath) return;
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch { /* ignore */ }
}

function createNullStorage(): StorageService {
  return {
    saveMessage: async () => {},
    getHistory: async () => [],
    searchHistory: async () => [],
    remember: async () => ({ id: "", content: "", tags: [], createdAt: new Date() }),
    recall: async () => [],
    saveScheduledTask: async () => {},
    getPendingTasks: async () => [],
    updateTaskStatus: async () => {},
    logToolExecution: async () => {},
    getToolExecutionLogs: async () => [],
    queueApproval: async () => "",
    getApproval: async () => "pending" as const,
    updateApprovalStatus: async () => {},
  };
}

async function main() {
  // 最先加载 .env
  loadDotEnv();

  const configPath = findFile("config.yaml") ?? resolve(process.cwd(), "config.yaml");

  let config;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    if (err instanceof TuiConfigError) {
      process.stderr.write(`配置错误：${err.message}\n`);
    } else {
      process.stderr.write(
        `启动失败：${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    process.exit(1);
  }

  const aiClient = createAIClient({
    provider: config.llm.provider,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl,
  });
  const llmProvider = aiClient as unknown as LLMProvider;

  let storage: StorageService | null = null;
  try {
    const storageConfig = StorageConfigLoader.fromYAML(configPath);
    const db = openDatabase(storageConfig.dbPath);
    const migrationPaths = [
      resolve(__dirname, "../../node_modules/@winches/storage/dist/migrations"),
      resolve(__dirname, "../../../storage/dist/migrations"),
      resolve(process.cwd(), "packages/storage/dist/migrations"),
      resolve(process.cwd(), "packages/storage/src/migrations"),
    ];
    for (const migrationsDir of migrationPaths) {
      try {
        const runner = new MigrationRunner(db, migrationsDir);
        runner.run();
        break;
      } catch { /* try next */ }
    }
    const embeddingService = new EmbeddingService(storageConfig.embedding);
    storage = new SqliteStorageService(db, embeddingService);
  } catch (err) {
    process.stderr.write(
      `警告：存储服务初始化失败，将以无持久化模式运行。原因：${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  const { createDefaultRegistry } = await import("@winches/core");
  const registry = createDefaultRegistry();

  const sessionId = `session-${Date.now()}`;
  const agent = new Agent({
    provider: llmProvider,
    storage: (storage ?? createNullStorage()) as unknown as StorageService,
    registry: registry as never,
    sessionId,
  });

  render(React.createElement(App, { config, agent, storage }));
}

main().catch((err: unknown) => {
  process.stderr.write(
    `未处理的错误：${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
