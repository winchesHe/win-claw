import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MigrationError, StorageError } from "./errors.js";

export { Database };

/**
 * 打开（或创建）SQLite 数据库，配置 WAL 模式、外键约束，并加载 sqlite-vec 扩展。
 */
export function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  try {
    sqliteVec.load(db);
  } catch (err) {
    throw new StorageError(
      `Failed to load sqlite-vec extension: ${err instanceof Error ? err.message : String(err)}`,
      "SQLITE_VEC_LOAD_ERROR",
      { cause: err },
    );
  }

  return db;
}

/**
 * 返回当前加载的 sqlite-vec 版本字符串。
 */
export function getVecVersion(db: Database.Database): string {
  const row = db.prepare("SELECT vec_version() AS version").get() as {
    version: string;
  };
  return row.version;
}

/**
 * 按文件名升序执行 migrationsDir 目录下所有未应用的 .sql 迁移脚本。
 */
export class MigrationRunner {
  private readonly db: Database.Database;
  private readonly migrationsDir: string;

  constructor(db: Database.Database, migrationsDir: string) {
    this.db = db;
    this.migrationsDir = migrationsDir;
  }

  run(): void {
    // 确保迁移版本跟踪表存在
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT    PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const files = readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const version = file;
      const already = this.db
        .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
        .get(version);

      if (already) continue;

      const sql = readFileSync(join(this.migrationsDir, file), "utf-8");

      const applyMigration = this.db.transaction(() => {
        this.db.exec(sql);
        this.db
          .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(version, Date.now());
      });

      try {
        applyMigration();
      } catch (err) {
        throw new MigrationError(
          `Migration "${file}" failed: ${err instanceof Error ? err.message : String(err)}`,
          file,
          { cause: err },
        );
      }
    }
  }
}
