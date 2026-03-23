import React from "react";
import { Box, Text } from "ink";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

/** 简单的 Markdown 渲染：将 Markdown 文本转换为 ink Text 元素数组 */
function renderMarkdown(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <Box
          key={keyCounter++}
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginY={0}
        >
          {lang && (
            <Text color="cyan" dimColor>
              {lang}
            </Text>
          )}
          {codeLines.map((cl, ci) => (
            <Text key={ci} color="yellow">
              {cl}
            </Text>
          ))}
        </Box>,
      );
      i++; // skip closing ```
      continue;
    }

    // 无序列表
    if (/^[-*] /.test(line)) {
      elements.push(
        <Text key={keyCounter++}>
          {"  • "}
          {renderInline(line.slice(2))}
        </Text>,
      );
      i++;
      continue;
    }

    // 有序列表
    const orderedMatch = /^(\d+)\. (.*)/.exec(line);
    if (orderedMatch) {
      elements.push(
        <Text key={keyCounter++}>
          {"  "}
          {orderedMatch[1]}
          {". "}
          {renderInline(orderedMatch[2])}
        </Text>,
      );
      i++;
      continue;
    }

    // 普通行（含行内 Markdown）
    if (line.length > 0) {
      elements.push(<Text key={keyCounter++}>{renderInline(line)}</Text>);
    } else {
      elements.push(<Text key={keyCounter++}>{""}</Text>);
    }
    i++;
  }

  return elements;
}

/** 渲染行内 Markdown（粗体、行内代码） */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // 匹配 **bold** 和 `code`
  const pattern = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={key++}>{text.slice(lastIndex, match.index)}</Text>);
    }
    if (match[0].startsWith("**")) {
      parts.push(
        <Text key={key++} bold>
          {match[2]}
        </Text>,
      );
    } else {
      parts.push(
        <Text key={key++} color="yellow" backgroundColor="gray">
          {match[3]}
        </Text>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<Text key={key++}>{text.slice(lastIndex)}</Text>);
  }

  return parts.length === 1 ? parts[0] : <Text>{parts}</Text>;
}

export function MessageBubble({ role, content, streaming = false }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <Box flexDirection="column" marginY={0} paddingX={1}>
      <Text color={isUser ? "cyan" : "green"} bold>
        {isUser ? "You:" : "Agent:"}
        {streaming && <Text color="yellow"> ●</Text>}
      </Text>
      <Box flexDirection="column" paddingLeft={2}>
        {isUser ? <Text>{content}</Text> : renderMarkdown(content)}
      </Box>
    </Box>
  );
}
