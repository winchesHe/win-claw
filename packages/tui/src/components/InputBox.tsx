import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";

export interface CompletionItem {
  command: string;
  description: string;
  type: "skill" | "builtin";
}

interface InputBoxProps {
  disabled?: boolean;
  onSubmit: (value: string) => void;
  placeholder?: string;
  completions?: CompletionItem[];
}

export function InputBox({
  disabled = false,
  onSubmit,
  placeholder,
  completions = [],
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 当输入以 / 开头时，过滤匹配的补全项
  const filtered = useMemo(() => {
    if (!value.startsWith("/") || value.includes(" ")) return [];
    const query = value.slice(1).toLowerCase();
    return completions.filter((c) => c.command.toLowerCase().startsWith(query));
  }, [value, completions]);

  const showCompletions = filtered.length > 0;

  useInput(
    (input, key) => {
      if (disabled) return;

      if (key.return) {
        // 如果有补全列表且选中了某项，直接填入命令
        if (showCompletions) {
          const safeIdx = Math.min(selectedIndex, filtered.length - 1);
          const selected = filtered[safeIdx];
          if (selected) {
            setValue(`/${selected.command} `);
            setSelectedIndex(0);
            return;
          }
        }

        const trimmed = value.trim();
        if (trimmed.length > 0) {
          onSubmit(trimmed);
          setValue("");
          setSelectedIndex(0);
        }
        return;
      }

      if (key.tab) {
        if (showCompletions) {
          const safeIdx = Math.min(selectedIndex, filtered.length - 1);
          const selected = filtered[safeIdx];
          if (selected) {
            setValue(`/${selected.command} `);
            setSelectedIndex(0);
          }
        }
        return;
      }

      if (key.upArrow && showCompletions) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
        return;
      }

      if (key.downArrow && showCompletions) {
        setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        return;
      }

      if (key.escape) {
        if (showCompletions) {
          setValue("");
          setSelectedIndex(0);
        }
        return;
      }

      if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1));
        setSelectedIndex(0);
        return;
      }

      // 忽略控制键
      if (key.ctrl || key.meta) return;

      if (input) {
        setValue((prev) => prev + input);
        setSelectedIndex(0);
      }
    },
    { isActive: !disabled },
  );

  return (
    <Box flexDirection="column">
      {showCompletions && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          {filtered.map((item, idx) => (
            <Text key={item.command}>
              <Text color={idx === selectedIndex ? "cyan" : "white"}>
                {idx === selectedIndex ? "❯ " : "  "}
              </Text>
              <Text color={idx === selectedIndex ? "cyan" : "green"}>/{item.command}</Text>
              <Text color="gray"> — {item.description}</Text>
            </Text>
          ))}
        </Box>
      )}
      <Box borderStyle="single" paddingX={1}>
        {disabled ? (
          <Text color="yellow">{placeholder ?? "Agent 思考中..."}</Text>
        ) : (
          <Text>
            <Text color="green">&gt; </Text>
            <Text>{value}</Text>
            <Text color="green">█</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}
