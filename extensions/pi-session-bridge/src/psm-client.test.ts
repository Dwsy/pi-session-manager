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

});
