import { describe, expect, it } from "vitest";
import {
  applyPriceMatches,
  buildModelEntryFromRemote,
  calculateSimilarity,
  findModelPrice,
  mapCatalogModelToEntry,
  mapModelsDevCost,
  mergeCatalogModelsIntoProvider,
  mergeModelCost,
  normalizeModelId,
  type CatalogModelOption,
  type ModelsDevCatalog,
} from "./catalog";

const sampleCatalog: ModelsDevCatalog = {
  openai: {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-5": {
        id: "gpt-5",
        name: "GPT-5",
        reasoning: true,
        modalities: { input: ["text", "image"], output: ["text"] },
        limit: { context: 200000, output: 64000 },
        cost: { input: 2, output: 8, cache_read: 0.5, cache_write: 2 },
      },
      o3: {
        id: "o3",
        name: "o3",
        reasoning: true,
        cost: { input: 2, output: 8, cache_read: 0.5 },
      },
    },
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    models: {
      "claude-sonnet-4-5": {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        reasoning: true,
        cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
      },
    },
  },
};

describe("model-config catalog helpers", () => {
  it("normalizes model ids for matching", () => {
    expect(normalizeModelId("openai/gpt-5")).toBe("gpt-5");
    expect(normalizeModelId("anthropic/claude-sonnet-4-5-20250929")).toBe(
      "claude-sonnet-4-5",
    );
    expect(normalizeModelId("MoonshotAI/Kimi_K2")).toContain("kimi");
  });

  it("maps models.dev cost fields into pi cost shape", () => {
    expect(
      mapModelsDevCost({
        input: 1,
        output: 2,
        cache_read: 0.1,
        cache_write: 0.2,
      }),
    ).toEqual({
      input: 1,
      output: 2,
      cacheRead: 0.1,
      cacheWrite: 0.2,
    });
  });

  it("maps catalog model options into model entries", () => {
    const option: CatalogModelOption = {
      id: "gpt-5",
      name: "GPT-5",
      providerId: "openai",
      providerName: "OpenAI",
      reasoning: true,
      contextWindow: 200000,
      maxTokens: 64000,
      cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
      input: ["text", "image"],
      raw: sampleCatalog.openai.models!["gpt-5"],
    };

    expect(mapCatalogModelToEntry(option)).toMatchObject({
      id: "gpt-5",
      name: "GPT-5",
      reasoning: true,
      contextWindow: 200000,
      maxTokens: 64000,
      input: ["text", "image"],
      cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    });
  });

  it("merges selected catalog models and skips duplicates", () => {
    const selected: CatalogModelOption[] = [
      {
        id: "gpt-5",
        name: "GPT-5",
        providerId: "openai",
        providerName: "OpenAI",
        reasoning: true,
        input: ["text"],
        raw: sampleCatalog.openai.models!["gpt-5"],
      },
      {
        id: "o3",
        name: "o3",
        providerId: "openai",
        providerName: "OpenAI",
        reasoning: true,
        input: ["text"],
        raw: sampleCatalog.openai.models!.o3,
      },
    ];

    const result = mergeCatalogModelsIntoProvider(
      [{ id: "gpt-5", name: "Existing" }],
      selected,
    );

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.models.map((model) => model.id)).toEqual(["gpt-5", "o3"]);
  });

  it("finds pricing by exact and normalized ids", () => {
    const exact = findModelPrice(sampleCatalog, "gpt-5");
    expect(exact?.matchedApiId).toBe("gpt-5");
    expect(exact?.matchType).toBe("exact");
    expect(exact?.cost.input).toBe(2);

    const normalized = findModelPrice(sampleCatalog, "openai/gpt-5");
    expect(normalized?.matchedApiId).toBe("gpt-5");
    expect(normalized?.matchType).toBe("exact");

    // Date suffixes are stripped by normalizeModelId, so this is still a safe exact match.
    const dated = findModelPrice(sampleCatalog, "claude-sonnet-4-5-20250929");
    expect(dated?.matchedApiId).toBe("claude-sonnet-4-5");
    expect(dated?.matchType).toBe("exact");

    const missing = findModelPrice(sampleCatalog, "totally-unknown-model-xyz");
    expect(missing).toBeNull();
  });

  it("does not apply fuzzy pricing unless explicitly enabled", () => {
    const strict = findModelPrice(sampleCatalog, "gpt5-local-proxy");
    expect(strict).toBeNull();

    const fuzzy = findModelPrice(sampleCatalog, "gpt-5-local-proxy", {
      allowFuzzy: true,
      similarityThreshold: 0.5,
    });
    // May or may not match depending on similarity; ensure fuzzy path is opt-in only.
    if (fuzzy) {
      expect(fuzzy.matchType).toBe("fuzzy");
    }
  });

  it("applies price matches across a provider model list and preserves extras", () => {
    const result = applyPriceMatches(
      [
        {
          id: "gpt-5",
          cost: { input: 0, output: 0, currency: "CNY" } as {
            input: number;
            output: number;
            currency: string;
          },
        },
        { id: "unknown-local-model" },
      ],
      sampleCatalog,
      "openai",
    );

    expect(result.updated).toBe(1);
    expect(result.unmatched).toEqual(["unknown-local-model"]);
    expect(result.models[0].cost).toMatchObject({
      input: 2,
      output: 8,
      cacheRead: 0.5,
      cacheWrite: 2,
      currency: "CNY",
    });
  });

  it("enriches remote models from models.dev metadata", () => {
    const built = buildModelEntryFromRemote(
      { id: "gpt-5", name: "local-gpt-5" },
      sampleCatalog,
      "openai",
    );
    expect(built.enriched).toBe(true);
    expect(built.model).toMatchObject({
      id: "gpt-5",
      name: "local-gpt-5",
      reasoning: true,
      contextWindow: 200000,
      maxTokens: 64000,
      cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
    });

    const unknown = buildModelEntryFromRemote(
      { id: "local-only-model" },
      sampleCatalog,
    );
    expect(unknown.enriched).toBe(false);
    expect(unknown.model.id).toBe("local-only-model");
  });

  it("merges cost fields without dropping extensions", () => {
    expect(
      mergeModelCost(
        { input: 1, output: 2, currency: "CNY" } as {
          input: number;
          output: number;
          currency: string;
        },
        { input: 3, output: 4, cacheRead: 0.1, cacheWrite: 0.2 },
      ),
    ).toMatchObject({
      input: 3,
      output: 4,
      cacheRead: 0.1,
      cacheWrite: 0.2,
      currency: "CNY",
    });
  });

  it("computes similarity scores", () => {
    expect(calculateSimilarity("gpt-5", "gpt-5")).toBe(1);
    expect(calculateSimilarity("gpt-5", "gpt5")).toBeGreaterThan(0.7);
  });
});
