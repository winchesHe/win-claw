#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  openDatabase,
  MigrationRunner,
  EmbeddingService,
  SqliteStorageService,
  StorageConfigLoader,
} from "@winches/storage";
import type { StorageService } from "@winches/storage";
import { startServer } from "./server/index.js";

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

/** 加载 .env，已有的环境变量不覆盖 */
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
  } catch {
    /* ignore */
  }
}

function initStorage(configPath: string, rootDir: string): StorageService {
  const storageConfig = StorageConfigLoader.fromYAML(configPath);
  const db = openDatabase(storageConfig.dbPath);

  const migrationPaths = [
    resolve(rootDir, "packages/storage/dist/migrations"),
    resolve(rootDir, "packages/storage/src/migrations"),
  ];

  for (const migrationsDir of migrationPaths) {
    try {
      if (!existsSync(migrationsDir)) continue;
      const runner = new MigrationRunner(db, migrationsDir);
      runner.run();
      break;
    } catch {
      /* try next */
    }
  }

  const embedding = new EmbeddingService(storageConfig.embedding);
  return new SqliteStorageService(db, embedding);
}

function main(): void {
  loadDotEnv();

  const configPath = findFile("config.yaml") ?? resolve(process.cwd(), "config.yaml");

  if (!existsSync(configPath)) {
    console.error(`错误：找不到配置文件 config.yaml`);
    process.exit(1);
  }

  // 项目根目录 = config.yaml 所在目录
  const rootDir = dirname(configPath);

  let storage: StorageService;
  try {
    storage = initStorage(configPath, rootDir);
  } catch (err) {
    console.error(`存储服务初始化失败：${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const port = Number(process.env.AGENT_WEB_UI_PORT) || 3000;
  startServer({ storage, rootDir, port });
}

main();
