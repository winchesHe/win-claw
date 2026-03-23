import { describe, it, expect } from "vitest";
import { buildMessages } from "../prompt.js";
import type { Message } from "@winches/ai";
import type { Memory } from "@winches/storage";

function makeMemory(content: string): Memory {
  return {
    id: "mem-1",
    content,
    tags: [],
    createdAt: new Date(),
  };
}

describe("buildMessages", () => {
  it("消息顺序正确：system → history → current", () => {
    const history: Message[] = [{ role: "user", content: "历史消息" }];
    const current: Message[] = [{ role: "user", content: "当前消息" }];
    const result = buildMessages("系统提示", [], history, current);

    expect(result[0].role).toBe("system");
    expect(result[1]).toEqual(history[0]);
    expect(result[2]).toEqual(current[0]);
    expect(result).toHaveLength(3);
  });

  it("有记忆时注入 <memory> 标签", () => {
    const memories = [makeMemory("用户喜欢 vim"), makeMemory("工作目录 ~/projects")];
    const result = buildMessages("系统提示", memories, [], []);

    const systemContent = result[0].content as string;
    expect(systemContent).toContain("<memory>");
    expect(systemContent).toContain("用户喜欢 vim");
    expect(systemContent).toContain("工作目录 ~/projects");
    expect(systemContent).toContain("</memory>");
  });

  it("空记忆时不注入记忆区块", () => {
    const result = buildMessages("系统提示", [], [], []);

    const systemContent = result[0].content as string;
    expect(systemContent).not.toContain("<memory>");
    expect(systemContent).toBe("系统提示");
  });

  it("system 消息 role 为 'system'", () => {
    const result = buildMessages("系统提示", [], [], []);
    expect(result[0].role).toBe("system");
  });

  it("无历史无当前消息时只有 system 消息", () => {
    const result = buildMessages("系统提示", [], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("system");
  });

  it("记忆内容以换行分隔", () => {
    const memories = [makeMemory("记忆A"), makeMemory("记忆B")];
    const result = buildMessages("提示", memories, [], []);
    const systemContent = result[0].content as string;
    expect(systemContent).toContain("记忆A\n记忆B");
  });
});
