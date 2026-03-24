import { useState, useCallback, useRef } from "react";
import type { Agent, ApprovalRequest } from "@winches/agent";
import type { ChatMessage, PendingApproval } from "../types.js";

interface UseAgentReturn {
  messages: ChatMessage[];
  isRunning: boolean;
  pendingApproval: PendingApproval | null;
  sendMessage: (content: string, sessionId: string) => Promise<void>;
  resolveApproval: (approved: boolean) => void;
  appendMessages: (msgs: ChatMessage[]) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export function useAgent(agent: Agent): UseAgentReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const currentAssistantIdRef = useRef<string | null>(null);
  const currentToolCallIdRef = useRef<string | null>(null);

  const appendMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  const sendMessage = useCallback(
    async (content: string, sessionId: string) => {
      void sessionId;
      if (isRunning) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        type: "user",
        content,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsRunning(true);

      agent.onApprovalNeeded = (request: ApprovalRequest): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
          setPendingApproval({ request, resolve });
        });
      };

      try {
        const stream = agent.chat([{ role: "user", content }]);
        const assistantId = crypto.randomUUID();
        currentAssistantIdRef.current = assistantId;

        setMessages((prev) => [
          ...prev,
          { id: assistantId, type: "assistant", content: "", streaming: true },
        ]);

        for await (const event of stream) {
          switch (event.type) {
            case "text": {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId && m.type === "assistant"
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
              break;
            }

            case "tool_call": {
              const toolCallId = crypto.randomUUID();
              currentToolCallIdRef.current = toolCallId;
              const toolMsg: ChatMessage = {
                id: toolCallId,
                type: "tool_call",
                toolName: event.tool,
                params: event.params,
                status: "running",
              };
              setMessages((prev) => [...prev, toolMsg]);
              break;
            }

            case "tool_result": {
              const tcId = currentToolCallIdRef.current;
              if (tcId) {
                const success = event.result.success;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === tcId && m.type === "tool_call"
                      ? { ...m, status: success ? "done" : "failed", result: event.result }
                      : m,
                  ),
                );
              }
              break;
            }

            case "approval_needed":
            case "done": {
              if (event.type === "done") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId && m.type === "assistant"
                      ? { ...m, streaming: false }
                      : m,
                  ),
                );
              }
              break;
            }
          }
        }
      } catch (err) {
        const errorContent = err instanceof Error ? err.message : String(err);
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          type: "error",
          content: `Agent 错误：${errorContent}`,
        };
        setMessages((prev) => {
          const filtered = prev.filter(
            (m) =>
              !(
                m.id === currentAssistantIdRef.current &&
                m.type === "assistant" &&
                m.content === ""
              ),
          );
          return [...filtered, errorMsg];
        });
      } finally {
        setIsRunning(false);
        setPendingApproval(null);
        currentAssistantIdRef.current = null;
        currentToolCallIdRef.current = null;
        agent.onApprovalNeeded = undefined;
      }
    },
    [agent, isRunning],
  );

  const resolveApproval = useCallback((approved: boolean) => {
    if (pendingApproval) {
      const { resolve } = pendingApproval;
      setPendingApproval(null);
      resolve(approved);
    }
  }, [pendingApproval]);

  return {
    messages,
    isRunning,
    pendingApproval,
    sendMessage,
    resolveApproval,
    appendMessages,
    setMessages,
  };
}
