import type { StorageService } from "@winches/storage";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { serveStaticSpy } = vi.hoisted(() => ({
  serveStaticSpy: vi.fn((_options: { root: string; path?: string }) => {
    return async (c: { text: (value: string) => Response }) => c.text("ok");
  }),
}));

vi.mock("@hono/node-server/serve-static", () => ({
  serveStatic: serveStaticSpy,
}));

function makeMockStorage(): StorageService {
  return {
    saveMessage: vi.fn(),
    getHistory: vi.fn(),
    searchHistory: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
    remember: vi.fn(),
    recall: vi.fn(),
    forget: vi.fn(),
    rememberWorking: vi.fn(),
    recallWorking: vi.fn(),
    searchEpisodic: vi.fn(),
    memorySummary: vi.fn().mockResolvedValue({
      longTerm: { count: 0, avgImportance: 0 },
      working: { count: 0, activeCount: 0 },
      episodic: { totalMessages: 0, vectorizedCount: 0 },
    }),
    saveScheduledTask: vi.fn(),
    getPendingTasks: vi.fn().mockResolvedValue([]),
    updateTaskStatus: vi.fn(),
    logToolExecution: vi.fn(),
    getToolExecutionLogs: vi.fn().mockResolvedValue([]),
    queueApproval: vi.fn(),
    getApproval: vi.fn(),
    updateApprovalStatus: vi.fn(),
  } as unknown as StorageService;
}

async function loadCreateApp(existsSyncImpl: (path: string) => boolean) {
  vi.resetModules();
  vi.doMock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
      ...actual,
      existsSync: (path: import("node:fs").PathLike) => existsSyncImpl(String(path)),
    };
  });

  const mod = await import("../server/index.js");
  return mod.createApp;
}

describe("createApp 静态资源目录选择", () => {
  beforeEach(() => {
    serveStaticSpy.mockClear();
    vi.resetModules();
    vi.unmock("node:fs");
  });

  it("优先使用已构建的 dist/client", async () => {
    const createApp = await loadCreateApp((path) => path === "/repo/dist/client");

    createApp({
      storage: makeMockStorage(),
      rootDir: "/repo",
    });

    expect(serveStaticSpy).toHaveBeenNthCalledWith(1, { root: "/repo/dist/client" });
    expect(serveStaticSpy).toHaveBeenNthCalledWith(2, {
      root: "/repo/dist/client",
      path: "index.html",
    });
  });

  it("dist/client 不存在时回退到源码目录", async () => {
    const createApp = await loadCreateApp((path) => path === "/repo/packages/web-ui/src/client");

    createApp({
      storage: makeMockStorage(),
      rootDir: "/repo",
    });

    expect(serveStaticSpy).toHaveBeenNthCalledWith(1, {
      root: "/repo/packages/web-ui/src/client",
    });
    expect(serveStaticSpy).toHaveBeenNthCalledWith(2, {
      root: "/repo/packages/web-ui/src/client",
      path: "index.html",
    });
  });
});
