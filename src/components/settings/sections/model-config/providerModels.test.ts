import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchProviderRemoteModels } from "./providerModels";

describe("fetchProviderRemoteModels", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              { id: "gpt-5", owned_by: "openai", created: 1 },
              { id: "o3", owned_by: "openai" },
              { id: "gpt-5", owned_by: "dup" },
            ],
          }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and dedupes openai-style model lists", async () => {
    const result = await fetchProviderRemoteModels("local", {
      baseUrl: "http://localhost:3838/v1",
      api: "openai-responses",
      apiKey: "sk-test",
      authHeader: true,
    });

    expect(result.url).toBe("http://localhost:3838/v1/models");
    expect(result.models.map((model) => model.id)).toEqual(["gpt-5", "o3"]);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3838/v1/models",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("rejects missing baseUrl", async () => {
    await expect(
      fetchProviderRemoteModels("local", {
        baseUrl: "",
      }),
    ).rejects.toThrow(/baseUrl/i);
  });
});
