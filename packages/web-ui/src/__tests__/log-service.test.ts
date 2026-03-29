import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LogService } from "../server/services/log-service.js";

function pinoLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    level: 30,
    time: 1700000000000,
    msg: "test message",
    pid: 1234,
    hostname: "localhost",
    ...overrides,
  });
}

describe("LogService", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "log-service-test-"));
    logPath = join(tempDir, "agent.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getLogs — 解析", () => {
    it("应正确解析合法的 pino JSON 行", () => {
      const lines = [
        pinoLine({ level: 30, time: 1700000000000, msg: "Server started" }),
        pinoLine({ level: 50, time: 1700000001000, msg: "Connection error" }),
      ].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs();

      expect(entries).toHaveLength(2);
      expect(entries[0].level).toBe(30);
      expect(entries[0].levelLabel).toBe("info");
      expect(entries[0].msg).toBe("Server started");
      expect(entries[0].timestamp).toBe(new Date(1700000000000).toISOString());
      expect(entries[1].level).toBe(50);
      expect(entries[1].levelLabel).toBe("error");
      expect(entries[1].msg).toBe("Connection error");
    });

    it("应保留附加字段", () => {
      writeFileSync(logPath, pinoLine({ reqId: "abc-123", duration: 42 }));

      const service = new LogService(logPath);
      const entries = service.getLogs();

      expect(entries).toHaveLength(1);
      expect(entries[0].reqId).toBe("abc-123");
      expect(entries[0].duration).toBe(42);
    });

    it("应跳过无效 JSON 行", () => {
      const lines = [
        pinoLine({ msg: "valid line 1" }),
        "this is not json",
        "{broken json",
        pinoLine({ msg: "valid line 2" }),
      ].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs();

      expect(entries).toHaveLength(2);
      expect(entries[0].msg).toBe("valid line 1");
      expect(entries[1].msg).toBe("valid line 2");
    });

    it("应跳过空行", () => {
      const lines = [pinoLine({ msg: "line1" }), "", "  ", pinoLine({ msg: "line2" })].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs();

      expect(entries).toHaveLength(2);
    });
  });

  describe("getLogs — 级别筛选", () => {
    it("应按级别筛选，仅返回 >= 指定级别的条目", () => {
      const lines = [
        pinoLine({ level: 20, msg: "debug msg" }),
        pinoLine({ level: 30, msg: "info msg" }),
        pinoLine({ level: 40, msg: "warn msg" }),
        pinoLine({ level: 50, msg: "error msg" }),
      ].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs({ level: "warn" });

      expect(entries).toHaveLength(2);
      expect(entries[0].msg).toBe("warn msg");
      expect(entries[1].msg).toBe("error msg");
    });

    it("level=debug 应返回所有条目", () => {
      const lines = [
        pinoLine({ level: 20, msg: "debug" }),
        pinoLine({ level: 30, msg: "info" }),
        pinoLine({ level: 40, msg: "warn" }),
        pinoLine({ level: 50, msg: "error" }),
      ].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs({ level: "debug" });

      expect(entries).toHaveLength(4);
    });

    it("level=error 应仅返回 error 条目", () => {
      const lines = [
        pinoLine({ level: 20, msg: "debug" }),
        pinoLine({ level: 30, msg: "info" }),
        pinoLine({ level: 40, msg: "warn" }),
        pinoLine({ level: 50, msg: "error" }),
      ].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs({ level: "error" });

      expect(entries).toHaveLength(1);
      expect(entries[0].msg).toBe("error");
    });

    it("无 level 参数时应返回所有条目", () => {
      const lines = [
        pinoLine({ level: 20 }),
        pinoLine({ level: 30 }),
        pinoLine({ level: 50 }),
      ].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs();

      expect(entries).toHaveLength(3);
    });
  });

  describe("getLogs — limit", () => {
    it("应限制返回条目数量", () => {
      const lines = Array.from({ length: 10 }, (_, i) => pinoLine({ msg: `msg-${i}` })).join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs({ limit: 3 });

      expect(entries).toHaveLength(3);
      expect(entries[0].msg).toBe("msg-0");
      expect(entries[2].msg).toBe("msg-2");
    });

    it("limit 大于总条目数时应返回所有条目", () => {
      const lines = [pinoLine({ msg: "a" }), pinoLine({ msg: "b" })].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs({ limit: 100 });

      expect(entries).toHaveLength(2);
    });

    it("limit 与 level 组合使用", () => {
      const lines = [
        pinoLine({ level: 20, msg: "debug1" }),
        pinoLine({ level: 40, msg: "warn1" }),
        pinoLine({ level: 50, msg: "error1" }),
        pinoLine({ level: 40, msg: "warn2" }),
        pinoLine({ level: 50, msg: "error2" }),
      ].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs({ level: "warn", limit: 2 });

      expect(entries).toHaveLength(2);
      expect(entries[0].msg).toBe("warn1");
      expect(entries[1].msg).toBe("error1");
    });
  });

  describe("getLogs — 错误处理", () => {
    it("应在日志文件不存在时抛出错误", () => {
      const service = new LogService(join(tempDir, "nonexistent.log"));
      expect(() => service.getLogs()).toThrow("Log file not found");
    });
  });

  describe("getLogs — 空文件", () => {
    it("应对空文件返回空数组", () => {
      writeFileSync(logPath, "");

      const service = new LogService(logPath);
      const entries = service.getLogs();

      expect(entries).toEqual([]);
    });
  });

  describe("级别标签映射", () => {
    it("应正确映射所有已知级别", () => {
      const lines = [
        pinoLine({ level: 20 }),
        pinoLine({ level: 30 }),
        pinoLine({ level: 40 }),
        pinoLine({ level: 50 }),
      ].join("\n");
      writeFileSync(logPath, lines);

      const service = new LogService(logPath);
      const entries = service.getLogs();

      expect(entries[0].levelLabel).toBe("debug");
      expect(entries[1].levelLabel).toBe("info");
      expect(entries[2].levelLabel).toBe("warn");
      expect(entries[3].levelLabel).toBe("error");
    });

    it("应对未知级别返回 'unknown'", () => {
      writeFileSync(logPath, pinoLine({ level: 99 }));

      const service = new LogService(logPath);
      const entries = service.getLogs();

      expect(entries[0].levelLabel).toBe("unknown");
    });
  });
});
