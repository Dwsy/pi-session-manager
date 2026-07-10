import type { ModelCost, ModelEntry, ModelInputType } from "./types";
import { clampCostValue, normalizeModelInputTypes } from "./utils";

export const MODELS_DEV_API_URL = "https://models.dev/api.json";

export interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

export interface ModelsDevModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  limit?: {
    context?: number;
    output?: number;
  };
  cost?: ModelsDevCost;
}

export interface ModelsDevProvider {
  id: string;
  name?: string;
  api?: string;
  npm?: string;
  doc?: string;
  models?: Record<string, ModelsDevModel>;
}

export type ModelsDevCatalog = Record<string, ModelsDevProvider>;

export interface CatalogModelOption {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  reasoning: boolean;
  contextWindow?: number;
  maxTokens?: number;
  cost?: ModelCost;
  input: ModelInputType[];
  raw: ModelsDevModel;
}

export interface CatalogProviderOption {
  id: string;
  name: string;
  modelCount: number;
  api?: string;
  npm?: string;
}

export interface PriceMatchResult {
  modelId: string;
  matchedApiId: string;
  similarity: number;
  matchType: "exact" | "normalized" | "fuzzy";
  cost: ModelCost;
}

const catalogCache: {
  fetchedAt: number;
  data: ModelsDevCatalog | null;
  promise: Promise<ModelsDevCatalog> | null;
} = {
  fetchedAt: 0,
  data: null,
  promise: null,
};

const CATALOG_TTL_MS = 5 * 60 * 1000;

export function clearModelsDevCatalogCache(): void {
  catalogCache.fetchedAt = 0;
  catalogCache.data = null;
  catalogCache.promise = null;
}

export async function fetchModelsDevCatalog(
  options: { force?: boolean } = {},
): Promise<ModelsDevCatalog> {
  const { force = false } = options;
  const now = Date.now();

  if (
    !force &&
    catalogCache.data &&
    now - catalogCache.fetchedAt < CATALOG_TTL_MS
  ) {
    return catalogCache.data;
  }

  if (!force && catalogCache.promise) {
    return catalogCache.promise;
  }

  const promise = (async () => {
    const response = await fetch(MODELS_DEV_API_URL, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch models.dev catalog: ${response.status} ${response.statusText}`,
      );
    }
    const data = (await response.json()) as ModelsDevCatalog;
    catalogCache.data = data;
    catalogCache.fetchedAt = Date.now();
    catalogCache.promise = null;
    return data;
  })();

  catalogCache.promise = promise;
  try {
    return await promise;
  } catch (error) {
    catalogCache.promise = null;
    throw error;
  }
}

export function listCatalogProviders(
  catalog: ModelsDevCatalog,
): CatalogProviderOption[] {
  return Object.values(catalog)
    .map((provider) => ({
      id: provider.id,
      name: provider.name?.trim() || provider.id,
      modelCount: Object.keys(provider.models ?? {}).length,
      api: provider.api,
      npm: provider.npm,
    }))
    .filter((provider) => provider.modelCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listCatalogModels(
  catalog: ModelsDevCatalog,
  providerId: string,
): CatalogModelOption[] {
  const provider = catalog[providerId];
  if (!provider?.models) return [];

  return Object.values(provider.models)
    .map((model) => mapCatalogModel(provider, model))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function mapCatalogModelToEntry(model: CatalogModelOption): ModelEntry {
  return {
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: model.input,
    contextWindow: model.contextWindow ?? 128000,
    maxTokens: model.maxTokens ?? 16384,
    cost: model.cost ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  };
}

export function mergeCatalogModelsIntoProvider(
  existingModels: ModelEntry[] | undefined,
  selected: CatalogModelOption[],
): { models: ModelEntry[]; added: number; skipped: number } {
  const models = [...(existingModels ?? [])];
  const existingIds = new Set(
    models.map((model) => model.id.trim().toLowerCase()).filter(Boolean),
  );

  let added = 0;
  let skipped = 0;

  for (const option of selected) {
    const key = option.id.trim().toLowerCase();
    if (!key) {
      skipped += 1;
      continue;
    }
    if (existingIds.has(key)) {
      skipped += 1;
      continue;
    }
    models.push(mapCatalogModelToEntry(option));
    existingIds.add(key);
    added += 1;
  }

  return { models, added, skipped };
}

export function mapModelsDevCost(cost?: ModelsDevCost): ModelCost {
  return {
    input: clampCostValue(cost?.input),
    output: clampCostValue(cost?.output),
    cacheRead: clampCostValue(cost?.cache_read),
    cacheWrite: clampCostValue(cost?.cache_write),
  };
}

export function normalizeModelId(id: string): string {
  return id
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/^anthropic\//, "")
    .replace(/^openai\//, "")
    .replace(/^google\//, "")
    .replace(/^x-ai\//, "")
    .replace(/^xai\//, "")
    .replace(/^meta-llama\//, "")
    .replace(/^z-ai\//, "")
    .replace(/^minimaxai\//, "")
    .replace(/^moonshotai\//, "")
    .replace(/^deepseek\//, "")
    .replace(/-\d{8}$/, "")
    .replace(/-preview$/, "")
    .replace(/-turbo$/, "")
    .replace(/v1$/, "");
}

export function calculateSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;

  const len1 = left.length;
  const len2 = right.length;
  const matrix: number[][] = Array.from({ length: len1 + 1 }, () =>
    Array.from({ length: len2 + 1 }, () => 0),
  );

  for (let i = 0; i <= len1; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= len2; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= len1; i += 1) {
    for (let j = 1; j <= len2; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[len1][len2];
  return 1 - distance / Math.max(len1, len2);
}

export interface FindModelPriceOptions {
  preferredProviderId?: string;
  /** Default false: only exact / high-confidence normalized matches. */
  allowFuzzy?: boolean;
  similarityThreshold?: number;
}

export function mergeModelCost(
  existing: ModelEntry["cost"] | undefined,
  next: ModelCost,
): ModelCost {
  // Preserve unknown extensions (e.g. currency) while overwriting price fields.
  return {
    ...(existing ?? {}),
    input: clampCostValue(next.input),
    output: clampCostValue(next.output),
    cacheRead: clampCostValue(next.cacheRead),
    cacheWrite: clampCostValue(next.cacheWrite),
  };
}

function stripVersionNoise(id: string): string {
  return id.replace(/-\d{8}$/, "").replace(/-\d+\.\d+$/, "");
}

export function findModelPrice(
  catalog: ModelsDevCatalog,
  modelId: string,
  options: FindModelPriceOptions = {},
): PriceMatchResult | null {
  const allowFuzzy = options.allowFuzzy === true;
  const threshold = options.similarityThreshold ?? 0.85;
  const normalizedTarget = normalizeModelId(modelId);
  if (!normalizedTarget) return null;

  // Use object holder so nested scanners can mutate without TS control-flow narrowing.
  const state: { best: PriceMatchResult | null } = { best: null };

  const consider = (
    apiModelId: string,
    apiModel: ModelsDevModel,
    matchType: PriceMatchResult["matchType"],
    similarity: number,
  ) => {
    if (!apiModel.cost) return;
    if (matchType === "fuzzy") {
      if (!allowFuzzy) return;
      if (similarity < threshold) return;
    }

    const cost = mapModelsDevCost(apiModel.cost);
    const candidate: PriceMatchResult = {
      modelId,
      matchedApiId: apiModelId,
      similarity,
      matchType,
      cost,
    };

    if (!state.best) {
      state.best = candidate;
      return;
    }

    const rank = (item: PriceMatchResult) => {
      const typeRank =
        item.matchType === "exact" ? 3 : item.matchType === "normalized" ? 2 : 1;
      const priced =
        (item.cost.input ?? 0) > 0 || (item.cost.output ?? 0) > 0 ? 1 : 0;
      return typeRank * 10 + priced * 5 + item.similarity;
    };

    if (rank(candidate) > rank(state.best)) {
      state.best = candidate;
    }
  };

  const scanProvider = (provider: ModelsDevProvider) => {
    for (const [apiModelId, apiModel] of Object.entries(provider.models ?? {})) {
      const normalizedApi = normalizeModelId(apiModelId);
      if (!normalizedApi) continue;

      // Strict exact: raw or normalized id equality only.
      if (apiModelId === modelId || normalizedApi === normalizedTarget) {
        consider(apiModelId, apiModel, "exact", 1);
        continue;
      }

      const baseTarget = stripVersionNoise(normalizedTarget);
      const baseApi = stripVersionNoise(normalizedApi);

      // High-confidence normalized: equal after stripping date/version noise.
      if (baseTarget && baseApi && baseTarget === baseApi) {
        consider(apiModelId, apiModel, "normalized", 0.99);
        continue;
      }

      if (!allowFuzzy) continue;

      if (
        baseApi.length >= 4 &&
        (normalizedTarget.includes(baseApi) || normalizedApi.includes(baseTarget))
      ) {
        const similarity = Math.max(
          calculateSimilarity(normalizedTarget, normalizedApi),
          calculateSimilarity(baseTarget, baseApi),
        );
        if (similarity >= threshold) {
          consider(apiModelId, apiModel, "fuzzy", similarity);
        }
      }
    }
  };

  if (options.preferredProviderId && catalog[options.preferredProviderId]) {
    scanProvider(catalog[options.preferredProviderId]);
    if (state.best && state.best.matchType !== "fuzzy") return state.best;
  }

  for (const provider of Object.values(catalog)) {
    if (provider.id === options.preferredProviderId) continue;
    scanProvider(provider);
  }

  if (!state.best) return null;
  if (state.best.matchType === "fuzzy" && !allowFuzzy) return null;
  if (state.best.matchType === "fuzzy" && state.best.similarity < threshold) {
    return null;
  }
  return state.best;
}

export function applyPriceMatches(
  models: ModelEntry[],
  catalog: ModelsDevCatalog,
  preferredProviderId?: string,
  options: { allowFuzzy?: boolean } = {},
): {
  models: ModelEntry[];
  updated: number;
  unmatched: string[];
  matches: PriceMatchResult[];
} {
  const unmatched: string[] = [];
  const matches: PriceMatchResult[] = [];
  let updated = 0;

  const nextModels = models.map((model) => {
    const match = findModelPrice(catalog, model.id, {
      preferredProviderId,
      allowFuzzy: options.allowFuzzy === true,
    });
    if (!match) {
      if (model.id.trim()) unmatched.push(model.id);
      return model;
    }
    matches.push(match);
    updated += 1;
    return {
      ...model,
      cost: mergeModelCost(model.cost, match.cost),
    };
  });

  return { models: nextModels, updated, unmatched, matches };
}

/** Find a models.dev catalog model by exact/normalized id (no fuzzy). */
export function findCatalogModelMeta(
  catalog: ModelsDevCatalog,
  modelId: string,
  preferredProviderId?: string,
): CatalogModelOption | null {
  const normalizedTarget = normalizeModelId(modelId);
  if (!normalizedTarget) return null;

  const state: { best: { option: CatalogModelOption; score: number } | null } = {
    best: null,
  };

  const consider = (provider: ModelsDevProvider, apiModel: ModelsDevModel) => {
    const apiId = apiModel.id;
    const normalizedApi = normalizeModelId(apiId);
    let score = 0;
    if (apiId === modelId || normalizedApi === normalizedTarget) {
      score = 3;
    } else if (
      stripVersionNoise(normalizedApi) === stripVersionNoise(normalizedTarget)
    ) {
      score = 2;
    } else {
      return;
    }
    const option = mapCatalogModel(provider, apiModel);
    if (!state.best || score > state.best.score) {
      state.best = { option, score };
    }
  };

  const scan = (provider: ModelsDevProvider | undefined) => {
    if (!provider?.models) return;
    for (const apiModel of Object.values(provider.models)) {
      consider(provider, apiModel);
    }
  };

  if (preferredProviderId) scan(catalog[preferredProviderId]);
  if (state.best && state.best.score >= 3) return state.best.option;

  for (const provider of Object.values(catalog)) {
    if (provider.id === preferredProviderId) continue;
    scan(provider);
  }

  return state.best?.option ?? null;
}

/**
 * Build a ModelEntry from a provider-remote model id, enriching from models.dev
 * when an exact/normalized catalog match exists.
 */
export function buildModelEntryFromRemote(
  item: { id: string; name?: string | null },
  catalog: ModelsDevCatalog,
  preferredProviderId?: string,
): { model: ModelEntry; enriched: boolean; matchedApiId?: string } {
  const id = item.id.trim();
  if (!id) {
    return {
      model: {
        id: "",
        name: "",
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 16384,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      enriched: false,
    };
  }

  const meta = findCatalogModelMeta(catalog, id, preferredProviderId);
  if (meta) {
    const entry = mapCatalogModelToEntry(meta);
    return {
      model: {
        ...entry,
        id,
        name: item.name?.trim() || entry.name || id,
      },
      enriched: true,
      matchedApiId: meta.id,
    };
  }

  return {
    model: {
      id,
      name: item.name?.trim() || id,
      reasoning: false,
      input: ["text"],
      contextWindow: 128000,
      maxTokens: 16384,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
    enriched: false,
  };
}

function mapCatalogModel(
  provider: ModelsDevProvider,
  model: ModelsDevModel,
): CatalogModelOption {
  const inputModalities = (model.modalities?.input ?? ["text"]).filter(
    (item): item is string => typeof item === "string",
  );

  return {
    id: model.id,
    name: model.name?.trim() || model.id,
    providerId: provider.id,
    providerName: provider.name?.trim() || provider.id,
    reasoning: model.reasoning === true,
    contextWindow: model.limit?.context,
    maxTokens: model.limit?.output,
    cost: mapModelsDevCost(model.cost),
    input: normalizeModelInputTypes(inputModalities),
    raw: model,
  };
}
