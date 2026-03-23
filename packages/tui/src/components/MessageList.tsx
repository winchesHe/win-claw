import React from "react";
import { Box, Text } from "ink";
import type { ChatMessage } from "../types.js";
import { MessageBubble } from "./MessageBubble.js";
import { ToolCallCard } from "./ToolCallCard.js";

const MAX_MESSAGES = 50;

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  // 仅渲染最近的消息，避免终端缓冲区溢出
  const visible = messages.slice(-MAX_MESSAGES);

  if (visible.length === 0) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="gray" dimColor>
          开始对话吧，输入消息后按 Enter 发送。输入 /help 查看可用命令。
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {visible.map((msg) => {
        switch (msg.type) {
          case "user":
            return <MessageBubble key={msg.id} role="user" content={msg.content} />;
          case "assistant":
            return (
              <MessageBubble
                key={msg.id}
                role="assistant"
                content={msg.content}
                streaming={msg.streaming}
              />
            );
          case "tool_call":
            return (
              <ToolCallCard
                key={msg.id}
                toolName={msg.toolName}
                params={msg.params}
                status={msg.status}
                result={msg.result}
                dangerLevel={msg.dangerLevel}
              />
            );
          case "error":
            return (
              <Box key={msg.id} paddingX={1}>
                <Text color="red">⚠ {msg.content}</Text>
              </Box>
            );
          case "system":
            return (
              <Box key={msg.id} paddingX={1}>
                <Text color="gray" dimColor>
                  {msg.content}
                </Text>
              </Box>
            );
        }
      })}
    </Box>
  );
}
