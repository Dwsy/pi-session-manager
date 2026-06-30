import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./connection-manager.js", () => ({
  getSessionId: () => "sid",
  notifyPsmTagChange: vi.fn(),
}));

const fullTextSearch = vi.fn();

vi.mock("./psm-client.js", () => ({
  scanSessions: vi.fn(),
  getSessionEntries: vi.fn(),
  fullTextSearch,
}));

describe("pi-session-bridge tools", () => {
  beforeEach(() => {
    fullTextSearch.mockReset();
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
