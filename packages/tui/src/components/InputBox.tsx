import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface InputBoxProps {
  disabled?: boolean;
  onSubmit: (value: string) => void;
  placeholder?: string;
}

export function InputBox({ disabled = false, onSubmit, placeholder }: InputBoxProps) {
  const [value, setValue] = useState("");

  useInput(
    (input, key) => {
      if (disabled) return;

      if (key.return) {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          onSubmit(trimmed);
          setValue("");
        }
        return;
      }

      if (key.backspace || key.delete) {
        setValue((prev) => prev.slice(0, -1));
        return;
      }

      // 忽略控制键
      if (key.ctrl || key.meta || key.escape) return;

      if (input) {
        setValue((prev) => prev + input);
      }
    },
    { isActive: !disabled },
  );

  return (
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
  );
}
