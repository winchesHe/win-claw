import { Agent } from "@winches/agent";
import type { LLMProvider } from "@winches/ai";
import type { StorageService } from "@winches/storage";
import type { IToolRegistry, ISkillRegistry, IMcpClientManager } from "@winches/core";
import type { ChatSession } from "./types.js";

export class SessionManager {
  private sessions: Map<number, ChatSession> = new Map();

  constructor(
    private provider: LLMProvider,
    private storage: StorageService,
    private registry: IToolRegistry,
    private skillRegistry?: ISkillRegistry,
    private mcpClientManager?: IMcpClientManager,
  ) {}

  getOrCreate(chatId: number): ChatSession {
    const existing = this.sessions.get(chatId);
    if (existing) return existing;

    const session = this.createSession(chatId);
    this.sessions.set(chatId, session);
    return session;
  }

  reset(chatId: number): ChatSession {
    const session = this.createSession(chatId);
    this.sessions.set(chatId, session);
    return session;
  }

  async listSessions(limit: number = 20) {
    return this.storage.listSessions(limit);
  }

  async switchSession(chatId: number, sessionId: string): Promise<boolean> {
    const history = await this.storage.getHistory(sessionId, 1);
    if (history.length === 0) {
      return false;
    }

    const session = this.createSession(chatId, sessionId);
    this.sessions.set(chatId, session);
    return true;
  }

  all(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  private createSession(chatId: number, sessionId: string = `telegram-${chatId}-${Date.now()}`): ChatSession {
    const agent = new Agent({
      provider: this.provider,
      storage: this.storage,
      registry: this.registry,
      sessionId,
      skillRegistry: this.skillRegistry,
      mcpClientManager: this.mcpClientManager,
    });
    return {
      chatId,
      sessionId,
      agent,
      activeMessageId: undefined,
      toolMessageMap: new Map(),
    };
  }
}
