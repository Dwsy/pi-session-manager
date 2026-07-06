import type {
  ModelConfigShape,
  ProviderEntry,
  ModelEntry,
  ModelInputType,
  ThinkingLevelMap,
} from "./types";
import {
  EMPTY_CONFIG,
  MODEL_INPUT_TYPE_OPTIONS,
  MODEL_THINKING_LEVEL_OPTIONS,
} from "./types";

export function asModelConfigShape(raw: unknown): ModelConfigShape {
  if (!raw || typeof raw !== "object") return EMPTY_CONFIG;
  const obj = raw as Record<string, unknown>;
  const providers =
    obj.providers && typeof obj.providers === "object"
      ? (obj.providers as Record<string, ProviderEntry>)
      : {};
  return { providers };
}

export function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const entries = Object.entries(headers).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function normalizeModelInputTypes(input?: readonly string[]): ModelInputType[] {
  const allowed = new Set<string>(MODEL_INPUT_TYPE_OPTIONS);
  const values = (input ?? ["text"]).filter((item) => allowed.has(item));
  return values.includes("image") ? ["text", "image"] : ["text"];
}

export function normalizeThinkingLevelMap(map?: ThinkingLevelMap): ThinkingLevelMap | undefined {
  if (!map) return undefined;

  const normalized: ThinkingLevelMap = {};
  for (const level of MODEL_THINKING_LEVEL_OPTIONS) {
    const value = map[level];
    if (value === null) {
      normalized[level] = null;
    } else if (typeof value === "string" && value.trim()) {
      normalized[level] = value.trim();
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeConfig(config: ModelConfigShape): ModelConfigShape {
  const providers: Record<string, ProviderEntry> = {};

  for (const providerName of Object.keys(config.providers).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const provider = config.providers[providerName] ?? {};
    providers[providerName] = {
      baseUrl: provider.baseUrl ?? "",
      api: provider.api ?? "openai-completions",
      apiKey: provider.apiKey ?? "",
      authHeader: provider.authHeader === true,
      headers: normalizeHeaders(provider.headers),
      models: (provider.models ?? []).map((model) => {
        const thinkingLevelMap = normalizeThinkingLevelMap(model.thinkingLevelMap);
        return {
          id: model.id ?? "",
          name: model.name ?? "",
          api: model.api ?? "",
          reasoning: model.reasoning === true,
          ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
          input: normalizeModelInputTypes(model.input),
          contextWindow: model.contextWindow ?? 128000,
          maxTokens: model.maxTokens ?? 16384,
          cost: {
            input: model.cost?.input ?? 0,
            output: model.cost?.output ?? 0,
            cacheRead: model.cost?.cacheRead ?? 0,
            cacheWrite: model.cost?.cacheWrite ?? 0,
          },
        };
      }),
    };
  }

  return { providers };
}

export function serializeConfig(config: ModelConfigShape): string {
  return JSON.stringify(normalizeConfig(config));
}

export function prettyConfig(config: ModelConfigShape): string {
  return JSON.stringify(normalizeConfig(config), null, 2);
}

export function createDefaultModel(): ModelEntry {
  return {
    id: "",
    name: "",
    reasoning: false,
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

export function createDefaultProvider(): ProviderEntry {
  return {
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    apiKey: "ollama",
    authHeader: false,
    models: [createDefaultModel()],
  };
}

export function modelSelectionValue(index: number): string {
  return String(index);
}
