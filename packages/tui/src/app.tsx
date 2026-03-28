import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { Agent } from "@winches/agent";
import { getSlashCommandCompletions } from "@winches/agent";
import type { StorageService } from "@winches/storage";
import type { ISkillRegistry } from "@winches/core";
import type { TuiConfig, ChatMessage } from "./types.js";
import { MessageList } from "./components/MessageList.js";
import { InputBox } from "./components/InputBox.js";
import type { CompletionItem } from "./components/InputBox.js";
import { ApprovalPrompt } from "./components/ApprovalPrompt.js";
import { useAgent } from "./hooks/useAgent.js";
import { useSession } from "./hooks/useSession.js";

interface AppProps {
  config: TuiConfig;
  agent: Agent;
  storage: StorageService | null;
  skillRegistry?: ISkillRegistry;
}

export function App({ config, agent, storage, skillRegistry }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [confirmExit, setConfirmExit] = useState(false);

  const {
    messages,
    isRunning,
    pendingApproval,
    sendMessage,
    resolveApproval,
    appendMessages,
    setMessages,
  } = useAgent(agent);

  const { currentSessionId, handleCommand, loadHistory, switchSession } = useSession(storage);

  // 合并 agent 层 slash command 补全和 session 层命令
  const completions = useMemo((): CompletionItem[] => {
    const items: CompletionItem[] = [];

    // Agent 层：skills + builtin（/mcp-status, /skills）
    if (skillRegistry) {
      items.push(...getSlashCommandCompletions(skillRegistry));
    }

    // Session 层内置命令
    items.push(
      { command: "new", description: "创建新会话", type: "builtin" },
      { command: "sessions", description: "列出历史会话", type: "builtin" },
      { command: "switch", description: "切换到指定会话", type: "builtin" },
      { command: "help", description: "显示帮助信息", type: "builtin" },
    );

    return items;
  }, [skillRegistry]);

  // 启动时加载历史消息并显示欢迎信息
  useEffect(() => {
    const init = async () => {
      const history = await loadHistory(currentSessionId);
      const welcomeMsg: ChatMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `欢迎使用 Winches Agent TUI！当前会话：${currentSessionId}`,
      };
      setMessages([welcomeMsg, ...history]);
    };
    void init();
  }, []);

  // Ctrl+C 退出处理
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (isRunning) {
        setConfirmExit(true);
      } else {
        exit();
      }
    }
    if (confirmExit) {
      if (input === "y" || input === "Y") {
        exit();
      } else if (input === "n" || input === "N") {
        setConfirmExit(false);
      }
    }
  });

  const handleSubmit = useCallback(
    async (input: string) => {
      const result = await handleCommand(input);
      if (result.handled) {
        if (input.startsWith("/switch ")) {
          const newId = input.slice(8).trim();
          const history = await loadHistory(newId);
          setMessages([...result.messages, ...history]);
          switchSession(newId);
        } else if (input === "/new") {
          setMessages(result.messages);
        } else {
          appendMessages(result.messages);
        }
        return;
      }

      await sendMessage(input, currentSessionId);
    },
    [
      handleCommand,
      loadHistory,
      switchSession,
      appendMessages,
      sendMessage,
      currentSessionId,
      setMessages,
    ],
  );

  const terminalWidth = stdout?.columns ?? 80;
  const isInputDisabled = isRunning || pendingApproval !== null;

  return (
    <Box flexDirection="column" width={terminalWidth}>
      <MessageList messages={messages} />

      {confirmExit && (
        <Box paddingX={1} borderStyle="single" borderColor="yellow">
          <Text color="yellow">Agent 正在运行，确认退出？(y/n) </Text>
        </Box>
      )}

      {pendingApproval && (
        <ApprovalPrompt
          request={pendingApproval.request}
          timeoutSeconds={config.approval.timeout}
          onApprove={() => resolveApproval(true)}
          onReject={() => resolveApproval(false)}
        />
      )}

      {!pendingApproval && !confirmExit && (
        <InputBox
          disabled={isInputDisabled}
          onSubmit={(value) => {
            void handleSubmit(value);
          }}
          completions={completions}
        />
      )}
    </Box>
  );
}
