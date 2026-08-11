import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.PSM_URL = "http://127.0.0.1:52131";
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: [] }),
  });
});

afterEach(() => {
  delete process.env.PSM_URL;
  vi.resetModules();
  fetchMock.mockReset();
});

describe("PSM HTTP client", () => {
  it("posts full text search to the normalized /api endpoint", async () => {
    const psm = await import("./psm-client.js");

    await psm.fullTextSearch({ query: "hello", page_size: 3 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:52131/api",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          command: "full_text_search",
          payload: {
            role_filter: "all",
            glob_pattern: null,
            project_path: null,
            page: 0,
            match_mode: "any",
            sort_order: "relevance",
            query: "hello",
            page_size: 3,
          },
        }),
      }),
    );
  });

  it("adds a finite AbortSignal to PSM requests", async () => {
    const psm = await import("./psm-client.js");

    await psm.fullTextSearch({ query: "hello", page_size: 1 });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports aborts as bounded request timeouts", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const psm = await import("./psm-client.js");

    await expect(psm.getSessionById("session-1")).rejects.toThrow("timed out");
  });

  it("checks bridge protocol capabilities before feature use", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { protocolVersion: 1, capabilities: ["entry_window"] } }),
    });
    const psm = await import("./psm-client.js");

    await expect(psm.ensureBridgeCapabilities(["entry_window"])).resolves.toEqual(expect.objectContaining({ protocolVersion: 1 }));
    await expect(psm.ensureBridgeCapabilities(["tag_api"])).rejects.toThrow("missing required bridge capabilities");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes camelCase tag responses from PSM dispatch", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [{ id: "tag-1", name: "review", color: "info", sortOrder: 3, isBuiltin: false, createdAt: "now", parentId: null }] }),
    });
    const psm = await import("./psm-client.js");

    await expect(psm.getAllTags()).resolves.toEqual([{ id: "tag-1", name: "review", color: "info", icon: undefined, sort_order: 3, is_builtin: false, created_at: "now", parent_id: null }]);
  });

  it("passes optional project path filter in full text search", async () => {
    const psm = await import("./psm-client.js");

    await psm.fullTextSearch({ query: "hello", page_size: 3, project_path: "/Users/me/project/demo" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(body).toEqual(
      expect.objectContaining({
        command: "full_text_search",
        payload: expect.objectContaining({
          query: "hello",
          project_path: "/Users/me/project/demo",
          page_size: 3,
        }),
      }),
    );
  });

});
