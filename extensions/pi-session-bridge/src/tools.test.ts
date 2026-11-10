import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyPsmStatusChange = vi.fn();

vi.mock("./connection-manager.js", () => ({
  getSessionId: () => "sid",
  notifyPsmStatusChange,
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

  it("omits hits from the current session unless includeSelf is set", async () => {
    fullTextSearch.mockResolvedValue({
      hits: [
        {
          session_id: "sid",
          session_path: "/tmp/current.jsonl",
          session_name: "Current Session",
          entry_id: "entry-self",
          role: "user",
          source_type: "user",
          content: "hello from the live session",
          timestamp: "2026-05-22T00:00:00Z",
          score: 2,
        },
        {
          session_id: "abcdef123456",
          session_path: "/tmp/past.jsonl",
          session_name: "Past Session",
          entry_id: "entry-past",
          role: "assistant",
          source_type: "assistant",
          content: "hello from a past session",
          timestamp: "2026-05-21T00:00:00Z",
          score: 1,
        },
      ],
      total_hits: 2,
      has_more: false,
    });
    const { sessionSearchTool } = await import("./tools.js");

    const result = await sessionSearchTool.execute("call-1", { query: "hello", pageSize: 5 });

    expect(result.content[0].text).toContain("Past Session [abcdef12]");
    expect(result.content[0].text).not.toContain("Current Session");
  });

  it("keeps hits from the current session when includeSelf is true", async () => {
    fullTextSearch.mockResolvedValue({
      hits: [{
        session_id: "sid",
        session_path: "/tmp/current.jsonl",
        session_name: "Current Session",
        entry_id: "entry-self",
        role: "user",
        source_type: "user",
        content: "hello from the live session",
        timestamp: "2026-05-22T00:00:00Z",
        score: 2,
      }],
      total_hits: 1,
      has_more: false,
    });
    const { sessionSearchTool } = await import("./tools.js");

    const result = await sessionSearchTool.execute("call-1", { query: "hello", includeSelf: true });

    expect(result.content[0].text).toContain("Current Session [sid]");
  });

  it("sets and clears the single session Status through legacy-compatible local files", async () => {
    const home = mkdtempSync(join(tmpdir(), "psm-tools-status-"));
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
      const { sessionStatusTool } = await import("./tools.js");

      const setResult = await sessionStatusTool.execute("call-1", { action: "set", status: "review" });
      const listResult = await sessionStatusTool.execute("call-2", { action: "list" });
      const clearResult = await sessionStatusTool.execute("call-3", { action: "clear" });

      const marksFile = JSON.parse(readFileSync(join(configDir, "session_mark.json"), "utf-8"));
      expect(setResult.isError).toBeUndefined();
      expect(listResult.content[0].text).toContain("(●) review");
      expect(clearResult.content[0].text).toBe("Status cleared");
      expect(marksFile.sessionTags).toEqual([]);
      expect(notifyPsmStatusChange).toHaveBeenCalledWith("sid");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("adds and removes independent GitHub-style Labels through the shared plugin config", async () => {
    const home = mkdtempSync(join(tmpdir(), "psm-tools-label-"));
    const previousHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const { readFileSync } = await import("node:fs");
      const configDir = join(home, ".pi", "pi-session-manager");
      const { sessionLabelTool } = await import("./tools.js");

      const setResult = await sessionLabelTool.execute("call-1", {
        action: "set",
        label: "backend",
        color: "#0969da",
        description: "Backend work",
      });
      const listResult = await sessionLabelTool.execute("call-2", { action: "list" });
      const removeResult = await sessionLabelTool.execute("call-3", { action: "remove", label: "backend" });

      const labelsFile = JSON.parse(readFileSync(join(configDir, "plugin-config", "builtin.kanban-board", "labels.json"), "utf-8"));
      expect(setResult.content[0].text).toBe("Label added: backend");
      expect(listResult.content[0].text).toContain("[x] backend #0969da — Backend work");
      expect(removeResult.content[0].text).toBe("Label removed: backend");
      expect(labelsFile.labels[0]).toEqual(expect.objectContaining({ name: "backend", color: "#0969da", description: "Backend work" }));
      expect(labelsFile.assignments).toEqual([]);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
