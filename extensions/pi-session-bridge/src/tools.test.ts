import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./connection-manager.js", () => ({
  getSessionId: () => "sid",
  notifyPsmTagChange: vi.fn(),
}));

const fullTextSearch = vi.fn();
const scanSessions = vi.fn();
const getSessionEntries = vi.fn();

vi.mock("./psm-client.js", () => ({
  scanSessions,
  getSessionEntries,
  fullTextSearch,
}));

describe("pi-session-bridge tools", () => {
  beforeEach(() => {
    fullTextSearch.mockReset();
    scanSessions.mockReset();
    getSessionEntries.mockReset();
    vi.resetModules();
  });

  it("renders session_search results from PSM full text search", async () => {
    fullTextSearch.mockResolvedValue({
      hits: [{
        session_id: "abcdef123456",
        session_path: "/tmp/session.jsonl",
        session_name: "Demo Session",
        entry_id: "entry-1",
        role: "assistant",
        source_type: "assistant",
        content: "hello from indexed session",
        timestamp: "2026-05-22T00:00:00Z",
        score: 1,
      }],
      total_hits: 1,
      has_more: false,
    });
    const { sessionSearchTool } = await import("./tools.js");

    const result = await sessionSearchTool.execute("call-1", { query: "hello", pageSize: 1 });

    expect(fullTextSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "hello",
      page_size: 1,
      source_filter: "content_only",
    }));
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Session search results for: hello");
    expect(result.content[0].text).toContain("Demo Session [abcdef12]");
  });

  it("forwards session_search time range params to backend", async () => {
    fullTextSearch.mockResolvedValue({
      hits: [],
      total_hits: 0,
      has_more: false,
    });
    const { sessionSearchTool } = await import("./tools.js");

    await sessionSearchTool.execute("call-1", {
      query: "hello",
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-30T23:59:59Z",
      pageSize: 5,
    });

    expect(fullTextSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "hello",
      page_size: 5,
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-30T23:59:59Z",
      source_filter: "content_only",
    }));
  });

  it("forwards session_search project path filter to backend", async () => {
    fullTextSearch.mockResolvedValue({
      hits: [],
      total_hits: 0,
      has_more: false,
    });
    const { sessionSearchTool } = await import("./tools.js");

    await sessionSearchTool.execute("call-1", {
      query: "hello",
      projectPath: "/Users/me/project/demo",
      pageSize: 10,
    });

    expect(fullTextSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "hello",
      page_size: 10,
      project_path: "/Users/me/project/demo",
      source_filter: "content_only",
    }));
  });

  it("truncates oversized session_recall entries before returning them to context", async () => {
    fullTextSearch.mockResolvedValue({
      hits: [{
        session_id: "abcdef123456",
        session_path: "/tmp/session.jsonl",
        session_name: "Long Session",
        entry_id: "entry-1",
        role: "user",
        source_type: "user",
        content: "oversized recall match",
        timestamp: "2026-05-22T00:00:00Z",
        score: 1,
      }],
      total_hits: 1,
      has_more: false,
    });
    scanSessions.mockResolvedValue([]);
    getSessionEntries.mockResolvedValue([{
      type: "message",
      id: "entry-1",
      message: { role: "user", content: [{ type: "text", text: "x".repeat(20_000) }] },
    }]);
    const { sessionRecallTool } = await import("./tools.js");

    const result = await sessionRecallTool.execute("call-1", {
      query: "oversized",
      maxResults: 1,
      before: 0,
      after: 0,
    });
    const output = result.content[0].text;

    expect(output).toContain("[entry truncated: 18000 characters omitted]");
    expect(output.length).toBeLessThan(2_500);
  });

  it("caps total session_recall output across multiple windows", async () => {
    fullTextSearch.mockResolvedValue({
      hits: Array.from({ length: 5 }, (_, index) => ({
        session_id: `session-${index}`,
        session_path: `/tmp/session-${index}.jsonl`,
        session_name: `Session ${index}`,
        entry_id: `entry-${index}`,
        role: "user",
        source_type: "user",
        content: "recall match",
        timestamp: "2026-05-22T00:00:00Z",
        score: 1,
      })),
      total_hits: 5,
      has_more: false,
    });
    scanSessions.mockResolvedValue([]);
    getSessionEntries.mockImplementation((sessionPath: string) => {
      const index = sessionPath.match(/session-(\d+)/)?.[1] || "0";
      return Promise.resolve([
        { type: "message", id: `before-${index}`, message: { role: "user", content: [{ type: "text", text: "a".repeat(3_000) }] } },
        { type: "message", id: `entry-${index}`, message: { role: "user", content: [{ type: "text", text: "b".repeat(3_000) }] } },
        { type: "message", id: `after-${index}`, message: { role: "assistant", content: [{ type: "text", text: "c".repeat(3_000) }] } },
      ]);
    });
    const { sessionRecallTool } = await import("./tools.js");

    const result = await sessionRecallTool.execute("call-1", { query: "recall", maxResults: 5 });
    const output = result.content[0].text;

    expect(output).toContain("[output truncated:");
    expect(output.length).toBeLessThan(12_100);
  });

  it("sets an existing session tag through local Kanban files", async () => {
    const home = mkdtempSync(join(tmpdir(), "psm-tools-"));
    const previousHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const { mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
      const configDir = join(home, ".pi", "pi-session-manager");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, "tags_config.json"), JSON.stringify({
        version: 1,
        tags: [{ id: "tag-1", name: "review", color: "info", sortOrder: 0, isBuiltin: false, createdAt: "now", parentId: null }],
      }));
      writeFileSync(join(configDir, "session_mark.json"), JSON.stringify({ version: 1, sessionTags: [] }));
      globalThis.fetch = vi.fn(() => Promise.reject(new Error("HTTP should not be used"))) as unknown as typeof fetch;
      const { sessionTagTool } = await import("./tools.js");

      const setResult = await sessionTagTool.execute("call-1", { action: "set", tag: "review" });
      const listResult = await sessionTagTool.execute("call-2", { action: "list" });
      const removeResult = await sessionTagTool.execute("call-3", { action: "remove", tag: "review" });

      const marksFile = JSON.parse(readFileSync(join(configDir, "session_mark.json"), "utf-8"));
      expect(setResult.isError).toBeUndefined();
      expect(listResult.content[0].text).toContain("[x] review");
      expect(removeResult.content[0].text).toBe("Removed: review");
      expect(marksFile.sessionTags).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
