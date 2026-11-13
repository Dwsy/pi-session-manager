// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@/types";
import { useSessionTimelineNav } from "./useSessionTimelineNav";

function message(id: string, role: string, content: string): SessionEntry {
  return {
    type: "message",
    id,
    timestamp: "2026-11-13T00:00:00Z",
    message: { role, content: [{ type: "text", text: content }] },
  };
}

const options = { enabled: true, previewFallback: "User message" };

describe("useSessionTimelineNav", () => {
  it("requires at least two user messages, not two arbitrary entries", () => {
    expect(renderHook(() => useSessionTimelineNav({ ...options, entries: [] })).result.current.items).toEqual([]);
    expect(renderHook(() => useSessionTimelineNav({
      ...options,
      entries: [message("u1", "user", "Hello"), message("a1", "assistant", "Hi")],
    })).result.current.items).toEqual([]);
    const { result } = renderHook(() => useSessionTimelineNav({
      ...options,
      entries: [message("u1", "user", "Hello"), message("a1", "assistant", "Hi"), message("u2", "user", "Again")],
    }));
    expect(result.current.items.map((item) => item.entryId)).toEqual(["u1", "u2"]);
  });

  it("pairs each user prompt with its own final assistant answer", () => {
    const { result } = renderHook(() => useSessionTimelineNav({
      ...options,
      entries: [
        message("u1", "user", "## 合并 goal tool\n我会把四个 Goal 工具合并"),
        message("a1", "assistant", "先做代码审查，这不是最终回答"),
        message("a2", "assistant", "## 最后结论\n已完成 Goal 工具合并。"),
        message("u2", "user", "增强我们的代码支持"),
        message("a3", "assistant", "修改已落下去了，右侧 pane 在跑。"),
        message("u3", "user", "第三轮暂时还在执行"),
      ],
    }));

    expect(result.current.items.map((item) => item.entryId)).toEqual(["u1", "u2", "u3"]);
    expect(result.current.items[0].title).toContain("合并 goal tool");
    expect(result.current.items[0].excerpt).toBe("最后结论 已完成 Goal 工具合并。");
    expect(result.current.items[0].excerpt).not.toContain("先做代码审查");
    expect(result.current.items[1].title).toBe("增强我们的代码支持");
    expect(result.current.items[1].excerpt).toBe("修改已落下去了，右侧 pane 在跑。");
    expect(result.current.items[2].excerpt).toBeUndefined();
  });

  it("never uses tool output or intermediate assistant text as a final reply", () => {
    const toolResult = {
      id: "tool-1",
      type: "tool_result",
      timestamp: "2026-11-13T00:00:00Z",
      content: [{ type: "text", text: "工具输出不应显示" }],
    } as unknown as SessionEntry;

    const { result } = renderHook(() => useSessionTimelineNav({
      ...options,
      entries: [
        message("u1", "user", "第一轮"),
        message("a1", "assistant", "中间态"),
        toolResult,
        message("u2", "user", "第二轮"),
        message("a2", "assistant", "第二轮最终回答"),
      ],
    }));

    expect(result.current.items[0].excerpt).toBeUndefined();
    expect(result.current.items[1].excerpt).toBe("第二轮最终回答");
  });
});
