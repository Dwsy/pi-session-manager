import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureBridgeCapabilities = vi.fn();
const fullTextSearch = vi.fn();
const scanSessionsPaginated = vi.fn();
const getSessionById = vi.fn();
const getSessionEntryWindow = vi.fn();
const getAllTags = vi.fn();
const getAllSessionTags = vi.fn();
const createTag = vi.fn();
const assignTag = vi.fn();
const removeTagFromSession = vi.fn();
const notifyPsmTagChange = vi.fn();

vi.mock("./connection-manager.js", () => ({
  getSessionId: () => "sid-current",
  notifyPsmTagChange,
}));

vi.mock("./psm-client.js", () => ({
  ensureBridgeCapabilities,
  fullTextSearch,
  scanSessionsPaginated,
  getSessionById,
  getSessionEntryWindow,
  getAllTags,
  getAllSessionTags,
  createTag,
  assignTag,
  removeTagFromSession,
}));

function searchHit(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "abcdef123456",
    session_path: "/tmp/session.jsonl",
    session_name: "Demo Session",
    entry_id: "entry-1",
    role: "assistant",
    source_type: "assistant",
    content: "hello from indexed session",
    timestamp: "2026-05-22T00:00:00Z",
    score: 1,
    ...overrides,
  };
}

function windowResult(overrides: Record<string, unknown> = {}) {
  return {
    sessionPath: "/tmp/session.jsonl",
    modifiedAt: 1,
    anchorFound: true,
    stale: false,
    truncated: false,
    entries: [{
      id: "entry-1",
      role: "assistant",
      text: "bounded context",
      timestamp: "2026-05-22T00:00:00Z",
      truncated: false,
    }],
    ...overrides,
  };
}

describe("pi-session-bridge tools", () => {
  beforeEach(() => {
    for (const mock of [
      ensureBridgeCapabilities,
      fullTextSearch,
      scanSessionsPaginated,
      getSessionById,
      getSessionEntryWindow,
      getAllTags,
      getAllSessionTags,
      createTag,
      assignTag,
      removeTagFromSession,
      notifyPsmTagChange,
    ]) mock.mockReset();

    ensureBridgeCapabilities.mockResolvedValue({ protocolVersion: 1, capabilities: [] });
    getAllTags.mockResolvedValue([]);
    getAllSessionTags.mockResolvedValue([]);
    vi.resetModules();
  });

  it("returns full session IDs and paths from bounded search hits", async () => {
    fullTextSearch.mockResolvedValue({ hits: [searchHit()], total_hits: 1, has_more: false });
    const { sessionSearchTool } = await import("./tools.js");

    const result = await sessionSearchTool.execute("call-1", { query: "hello", pageSize: 1 });

    expect(fullTextSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "hello",
      page_size: 1,
      source_filter: "content_only",
      max_content_chars: 1_000,
      match_mode: "any",
    }));
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Demo Session [abcdef12]");
    expect(result.content[0].text).toContain("sessionId: abcdef123456");
    expect(result.content[0].text).toContain("sessionPath: /tmp/session.jsonl");
  });

  it("keeps smart opt-in and forwards search time/project filters", async () => {
    fullTextSearch.mockResolvedValue({ hits: [], total_hits: 0, has_more: false });
    const { sessionSearchTool } = await import("./tools.js");

    await sessionSearchTool.execute("call-1", {
      query: "hello",
      matchMode: "smart",
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-30T23:59:59Z",
      projectPath: "/Users/me/project/demo",
    });

    expect(fullTextSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "hello",
      match_mode: "smart",
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-30T23:59:59Z",
      project_path: "/Users/me/project/demo",
    }));
  });

  it("uses exact session lookup plus bounded window for context", async () => {
    getSessionById.mockResolvedValue({
      id: "abcdef123456",
      path: "/tmp/session.jsonl",
      cwd: "/tmp",
      created: "now",
      modified: "now",
      message_count: 1,
      first_message: "",
      last_message: "",
      last_message_role: "assistant",
    });
    getSessionEntryWindow.mockResolvedValue(windowResult());
    const { sessionContextTool } = await import("./tools.js");

    const result = await sessionContextTool.execute("call-1", { sessionId: "abcdef123456", maxChars: 2_000 });

    expect(getSessionById).toHaveBeenCalledWith("abcdef123456");
    expect(scanSessionsPaginated).not.toHaveBeenCalled();
    expect(getSessionEntryWindow).toHaveBeenCalledWith(expect.objectContaining({
      path: "/tmp/session.jsonl",
      maxChars: 2_000,
    }));
    expect(result.content[0].text).toContain("bounded context");
  });

  it("supports legacy short IDs only through bounded ambiguity-checked lookup", async () => {
    getSessionById.mockResolvedValue(null);
    scanSessionsPaginated.mockResolvedValue({
      sessions: [{
        id: "abcdef123456",
        path: "/tmp/session.jsonl",
        cwd: "/tmp",
        created: "now",
        modified: "now",
        message_count: 1,
        first_message: "",
        last_message: "",
        last_message_role: "assistant",
      }],
      total: 1,
      offset: 0,
      limit: 20,
      has_more: false,
    });
    getSessionEntryWindow.mockResolvedValue(windowResult());
    const { sessionContextTool } = await import("./tools.js");

    await sessionContextTool.execute("call-1", { sessionId: "abcdef12" });

    expect(scanSessionsPaginated).toHaveBeenCalledWith(expect.objectContaining({
      limit: 20,
      search_query: "abcdef12",
    }));
    expect(getSessionEntryWindow).toHaveBeenCalledWith(expect.objectContaining({ path: "/tmp/session.jsonl" }));
  });

  it("recall uses FTS hit paths directly and bounded anchored windows", async () => {
    fullTextSearch.mockResolvedValue({ hits: [searchHit()], total_hits: 1, has_more: false });
    getSessionEntryWindow.mockResolvedValue(windowResult());
    const { sessionRecallTool } = await import("./tools.js");

    const result = await sessionRecallTool.execute("call-1", { query: "hello", maxResults: 1 });

    expect(scanSessionsPaginated).not.toHaveBeenCalled();
    expect(getSessionById).not.toHaveBeenCalled();
    expect(getSessionEntryWindow).toHaveBeenCalledWith(expect.objectContaining({
      path: "/tmp/session.jsonl",
      anchorEntryId: "entry-1",
      includeTools: true,
    }));
    expect(result.content[0].text).toContain("sessionId: abcdef123456");
    expect(result.content[0].text).toContain("bounded context");
  });

  it("does not substitute unrelated recall context when an anchor is stale", async () => {
    fullTextSearch.mockResolvedValue({ hits: [searchHit()], total_hits: 1, has_more: false });
    getSessionEntryWindow.mockResolvedValue(windowResult({ anchorFound: false, entries: [] }));
    const { sessionRecallTool } = await import("./tools.js");

    const result = await sessionRecallTool.execute("call-1", { query: "hello", maxResults: 1 });

    expect(result.content[0].text).toContain("stale anchor");
    expect(result.content[0].text).not.toContain("bounded context");
  });

  it("lists tagged sessions through the paginated PSM catalog", async () => {
    getAllTags.mockResolvedValue([{ id: "tag-1", name: "review", color: "info", sort_order: 0, is_builtin: false, created_at: "now", parent_id: null }]);
    scanSessionsPaginated.mockResolvedValue({
      sessions: [{
        id: "session-full-id",
        path: "/tmp/tagged.jsonl",
        cwd: "/work",
        name: "Tagged",
        created: "now",
        modified: "now",
        message_count: 2,
        first_message: "",
        last_message: "",
        last_message_role: "assistant",
      }],
      total: 1,
      offset: 0,
      limit: 20,
      has_more: false,
    });
    const { sessionListTool } = await import("./tools.js");

    const result = await sessionListTool.execute("call-1", { tag: "review" });

    expect(scanSessionsPaginated).toHaveBeenCalledWith(expect.objectContaining({ filter_tag_ids: ["tag-1"] }));
    expect(result.content[0].text).toContain("sessionId: session-full-id");
    expect(result.content[0].text).toContain("sessionPath: /tmp/tagged.jsonl");
  });

  it("mutates tags through PSM API instead of local files", async () => {
    getAllTags.mockResolvedValue([{ id: "tag-1", name: "review", color: "info", sort_order: 0, is_builtin: false, created_at: "now", parent_id: null }]);
    getAllSessionTags.mockResolvedValue([]);
    assignTag.mockResolvedValue(undefined);
    const { sessionTagTool } = await import("./tools.js");

    const result = await sessionTagTool.execute("call-1", { action: "set", tag: "review" });

    expect(assignTag).toHaveBeenCalledWith("sid-current", "tag-1");
    expect(notifyPsmTagChange).toHaveBeenCalledWith("sid-current", []);
    expect(result.content[0].text).toBe("Tag set: review");
  });

  it("keeps context output bounded even if a backend violates its text budget", async () => {
    getSessionEntryWindow.mockResolvedValue(windowResult({
      entries: [{ id: "entry-1", role: "assistant", text: "x".repeat(20_000), timestamp: "now", truncated: false }],
    }));
    const { sessionContextTool } = await import("./tools.js");

    const result = await sessionContextTool.execute("call-1", { sessionPath: "/tmp/session.jsonl", maxChars: 1_000 });

    expect(result.content[0].text).toContain("context output truncated");
    expect(result.content[0].text.length).toBeLessThan(3_100);
  });
});
