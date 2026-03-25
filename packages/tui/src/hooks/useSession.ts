import { useState, useCallback } from "react";
import type { StorageService } from "@winches/storage";
import type { ChatMessage } from "../types.js";

/** 解析斜杠命令，返回命令类型和参数 */
export function parseCommand(
  input: string,
): { command: string; args: string[] } | null {
  if (!input.startsWith("/")) return null;
  const parts = input.slice(1).trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  return { command, args };
}

const HELP_TEXT = `可用命令：
  /new              — 创建新会话
  /sessions         — 列出历史会话
  /switch <id>      — 切换到指定会话
  /help             — 显示此帮助信息`;

interface UseSessionReturn {
  currentSessionId: string;
  /** 处理斜杠命令，返回要追加到消息列表的系统消息（null 表示非命令） */
  handleCommand: (
    input: string,
  ) => Promise<{ handled: boolean; messages: ChatMessage[] }>;
  /** 加载指定 session 的历史消息 */
  loadHistory: (sessionId: string) => Promise<ChatMessage[]>;
  /** 切换到新 session */
  switchSession: (sessionId: string) => void;
}

function generateSessionId(): string {
  return `session-${Date.now()}`;
}

function systemMsg(content: string): ChatMessage {
  return { id: crypto.randomUUID(), type: "system", content };
}

export function useSession(storage: StorageService | null): UseSessionReturn {
  const [currentSessionId, setCurrentSessionId] = useState<string>(
    () => generateSessionId(),
  );

  const loadHistory = useCallback(
    async (sessionId: string): Promise<ChatMessage[]> => {
      if (!storage) return [];
      try {
        const history = await storage.getHistory(sessionId);
        return history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => {
            const content =
              typeof m.content === "string"
                ? m.content
                : JSON.stringify(m.content);
            if (m.role === "user") {
              return {
                id: crypto.randomUUID(),
                type: "user" as const,
                content,
              };
            }
            return {
              id: crypto.randomUUID(),
              type: "assistant" as const,
              content,
              streaming: false,
            };
          });
      } catch {
        return [];
      }
    },
    [storage],
  );

  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const handleCommand = useCallback(
    async (
      input: string,
    ): Promise<{ handled: boolean; messages: ChatMessage[] }> => {
      const parsed = parseCommand(input);
      if (!parsed) return { handled: false, messages: [] };

      const { command, args } = parsed;

      switch (command) {
        case "new": {
          const newId = generateSessionId();
          setCurrentSessionId(newId);
          return {
            handled: true,
            messages: [systemMsg(`已创建新会话：${newId}`)],
          };
        }

        case "sessions": {
          if (!storage) {
            return {
              handled: true,
              messages: [systemMsg("存储服务不可用，无法列出历史会话。")],
            };
          }
          try {
            const sessions = await storage.listSessions(20);
            if (sessions.length === 0) {
              return {
                handled: true,
                messages: [systemMsg("暂无历史会话。")],
              };
            }
            const lines = sessions.map((s) => {
              const isCurrent = s.sessionId === currentSessionId ? " ← 当前" : "";
              const time = s.lastActiveAt.toLocaleString();
              return `  ${s.sessionId}  (${s.messageCount} 条消息, ${time})${isCurrent}`;
            });
            return {
              handled: true,
              messages: [systemMsg(`历史会话：\n${lines.join("\n")}`)],
            };
          } catch {
            return {
              handled: true,
              messages: [systemMsg("获取会话列表失败。")],
            };
          }
        }

        case "switch": {
          const targetId = args[0];
          if (!targetId) {
            return {
              handled: true,
              messages: [systemMsg("用法：/switch <sessionId>")],
            };
          }
          if (!storage) {
            setCurrentSessionId(targetId);
            return {
              handled: true,
              messages: [systemMsg(`已切换到会话：${targetId}`)],
            };
          }
          try {
            const history = await storage.getHistory(targetId);
            if (history.length === 0) {
              return {
                handled: true,
                messages: [systemMsg("会话不存在")],
              };
            }
            setCurrentSessionId(targetId);
            return {
              handled: true,
              messages: [systemMsg(`已切换到会话：${targetId}`)],
            };
          } catch {
            return {
              handled: true,
              messages: [systemMsg("切换会话失败，请检查会话 ID。")],
            };
          }
        }

        case "help": {
          return {
            handled: true,
            messages: [systemMsg(HELP_TEXT)],
          };
        }

        default: {
          return {
            handled: true,
            messages: [systemMsg(`未知命令：/${command}。输入 /help 查看可用命令。`)],
          };
        }
      }
    },
    [storage, currentSessionId],
  );

  return { currentSessionId, handleCommand, loadHistory, switchSession };
}
