import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalRequest } from "@winches/agent";

interface ApprovalPromptProps {
  request: ApprovalRequest;
  timeoutSeconds: number;
  onApprove: () => void;
  onReject: () => void;
}

export function ApprovalPrompt({
  request,
  timeoutSeconds,
  onApprove,
  onReject,
}: ApprovalPromptProps) {
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (remaining <= 0) {
      setTimedOut(true);
      onReject();
      return;
    }
    const timer = setTimeout(() => {
      setRemaining((r) => r - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [remaining, onReject]);

  useInput((input) => {
    if (timedOut) return;
    if (input === "y" || input === "Y") {
      onApprove();
    } else if (input === "n" || input === "N") {
      onReject();
    }
    // 其他按键忽略
  });

  const isDangerous = request.dangerLevel === "dangerous";
  const dangerColor = isDangerous ? "red" : "yellow";

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={dangerColor}
      paddingX={2}
      paddingY={1}
    >
      <Text color={dangerColor} bold>
        ⚠ 需要审批
      </Text>
      <Box marginTop={1} flexDirection="column" gap={0}>
        <Text>
          工具:{" "}
          <Text color={isDangerous ? "red" : "white"} bold>
            {request.toolName}
          </Text>
        </Text>
        <Text>
          危险等级:{" "}
          <Text color={dangerColor} bold>
            {request.dangerLevel}
          </Text>
        </Text>
        <Text color="gray">参数: {JSON.stringify(request.params, null, 0).slice(0, 200)}</Text>
      </Box>
      {timedOut ? (
        <Box marginTop={1}>
          <Text color="red">审批超时，已自动拒绝。</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="row" gap={2}>
          <Text>
            批准{" "}
            <Text color="green" bold>
              [y]
            </Text>
          </Text>
          <Text>
            拒绝{" "}
            <Text color="red" bold>
              [n]
            </Text>
          </Text>
          <Text color="gray">({remaining}s 后自动拒绝)</Text>
        </Box>
      )}
    </Box>
  );
}
