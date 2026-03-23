import React from "react";
import { Box, Text } from "ink";

interface ToolCallCardProps {
  toolName: string;
  params: unknown;
  status: "running" | "done" | "failed";
  result?: { success: boolean; output?: string; error?: string };
  dangerLevel?: string;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** 截断字符串至指定长度 */
export function truncate(str: string, maxLen = 200): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

export function ToolCallCard({ toolName, params, status, result, dangerLevel }: ToolCallCardProps) {
  const isDangerous = dangerLevel === "dangerous";
  const paramStr = truncate(JSON.stringify(params, null, 0));

  const statusIcon =
    status === "running"
      ? SPINNER_FRAMES[Math.floor(Date.now() / 80) % SPINNER_FRAMES.length]
      : status === "done"
        ? "✓"
        : "✗";

  const statusColor = status === "running" ? "yellow" : status === "done" ? "green" : "red";

  return (
    <Box flexDirection="column" paddingX={1} marginY={0}>
      <Box gap={1}>
        <Text color={statusColor}>{statusIcon}</Text>
        <Text color={isDangerous ? "red" : "white"} bold>
          {toolName}
        </Text>
        <Text color="gray">{paramStr}</Text>
      </Box>
      {status !== "running" && result && (
        <Box paddingLeft={4}>
          <Text color={result.success ? "green" : "red"}>
            {truncate(result.output ?? result.error ?? "", 200)}
          </Text>
        </Box>
      )}
    </Box>
  );
}
