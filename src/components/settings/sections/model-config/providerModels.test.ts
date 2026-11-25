import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchProviderRemoteModels } from "./providerModels";
import { serializeConfig } from "./utils";

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

  it("imports Go's live chat routes and model metadata into Pi configuration", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [
      {
        id: "minimax-m3",
        name: "MiniMax M3",
        type: "chat",
        recommended_api: "messages",
        api: { messages: { base_url: "https://opencode.ai/inference/go/anthropic/v1" } },
        modalities: { input: ["text", "image/png"] },
        capabilities: { reasoning: { supported: true, effort: ["low", "max"] } },
        limit: { context: 1000000, output: 131072 },
        cost: { text: { input: { price: 0.3, cache: { read: 0.03, write: { "5m": 1.875, "1h": 3 } } }, output: { price: 1.2 } } },
      },
      {
        id: "gemini-4-argon",
        type: "chat",
        recommended_api: "interactions",
        api: {
          interactions: { base_url: "https://opencode.ai/inference/go/google/v1beta" },
          "generate-content": { base_url: "https://opencode.ai/inference/go/google/v1beta" },
        },
      },
      { id: "qwen3-embedding-8b", type: "embedding" },
      { id: "jev-1.14", type: "decision" },
      { id: "new-chat-model", object: "model" },
    ] })));

    const result = await fetchProviderRemoteModels("opencode-go", {
      baseUrl: "https://opencode.ai/zen/go/v1",
      api: "google-generative-ai",
      apiKey: "!read-key",
      headers: { Authorization: "should-stay-local" },
    });
    expect(result.url).toBe("https://opencode.ai/inference/go/v1/models");
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toEqual(new Headers({ Accept: "application/json" }));
    expect(result.models.map(({ id }) => id)).toEqual(["gemini-4-argon", "minimax-m3", "new-chat-model"]);

    // Serialized entries keep model-level routes without overriding the built-in provider globally.
    const models = result.models.map(({ modelConfig }) => modelConfig!);
    const saved = JSON.parse(serializeConfig({ providers: { "opencode-go": { models } } }));
    const provider = saved.providers["opencode-go"];
    expect(provider).not.toHaveProperty("baseUrl");
    expect(provider.models).toMatchObject([
      { api: "google-generative-ai", baseUrl: "https://opencode.ai/inference/go/google/v1beta" },
      {
        name: "MiniMax M3",
        api: "anthropic-messages",
        baseUrl: "https://opencode.ai/inference/go/anthropic",
        reasoning: true,
        thinkingLevelMap: { low: "low", medium: null, max: "max" },
        input: ["text", "image"],
        contextWindow: 1000000,
        maxTokens: 131072,
        cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 1.875 },
      },
      { api: "openai-completions", baseUrl: "https://opencode.ai/inference/go/openai/v1", compat: { maxTokensField: "max_tokens", supportsStore: false } },
    ]);
  });

  it("blocks importing Go models under Pi's Zen credential identity", async () => {
    await expect(fetchProviderRemoteModels("opencode", { baseUrl: "https://opencode.ai/zen/go/v1" })).rejects.toThrow(/opencode-go/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
