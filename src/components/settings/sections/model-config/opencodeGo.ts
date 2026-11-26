import type { ModelEntry, ThinkingLevelMap } from "./types";
import { clampCostValue } from "./utils";

/** OpenCode Go's shared catalog, including metadata and routes for each model. */
export const OPENCODE_GO_MODELS_URL = "https://opencode.ai/inference/go/v1/models";

/** Routes supported by Pi, in fallback order when the recommended API is unavailable. */
const routes = [
  { protocol: "chat-completions", api: "openai-completions", path: "/openai/v1" },
  { protocol: "responses", api: "openai-responses", path: "/openai/v1" },
  { protocol: "messages", api: "anthropic-messages", path: "/anthropic/v1" },
  { protocol: "generate-content", api: "google-generative-ai", path: "/google/v1beta" },
] as const;

/** Fields consumed from the Go model list's models.dev v2 metadata. */
export interface GoModelMetadata {
  type?: string;
  recommended_api?: string;
  api?: Record<string, { base_url?: string }>;
  capabilities?: { reasoning?: { supported?: boolean; effort?: string[] } };
  modalities?: { input?: string[] };
  limit?: { context?: number; output?: number };
  cost?: {
    text?: {
      input?: { price?: number; cache?: { read?: number; write?: number | { "5m"?: number; "30m"?: number; "1h"?: number; "12h"?: number } } };
      output?: { price?: number };
    };
  };
}

/** Match Go's official base URLs or Pi's built-in provider without a base override. */
export function usesOpenCodeGoCatalog(provider: string, baseUrl?: string): boolean {
  const base = baseUrl?.trim().replace(/\/+$/, "");
  if (!base) return provider === "opencode-go";
  return /^https:\/\/opencode\.ai\/(?:zen\/go|inference\/go)(?:\/|$)/.test(base);
}

/** Convert a catalog chat model to Pi's model configuration, with an explicit protocol and URL. */
export function buildOpenCodeGoModel(
  id: string,
  name: string | null | undefined,
  metadata: GoModelMetadata,
): ModelEntry | null {
  if (metadata.type && metadata.type !== "chat") return null;

  // Prefer the native API when Pi supports it. Gemini exposes GenerateContent alongside Interactions.
  const route = routes.find(({ protocol }) => protocol === metadata.recommended_api && metadata.api?.[protocol])
    ?? routes.find(({ protocol }) => metadata.api?.[protocol]);
  if (!route && metadata.api && Object.keys(metadata.api).length > 0) return null;

  // A sparse response can still use the gateway's Chat Completions translation.
  const selected = route ?? routes[0];
  const expectedBase = `https://opencode.ai/inference/go${selected.path}`;
  const baseUrl = metadata.api?.[selected.protocol]?.base_url ?? expectedBase;
  if (baseUrl !== expectedBase) return null;

  // Keep the provider's supported thinking efforts without inventing aliases for missing levels.
  const reasoning = metadata.capabilities?.reasoning;
  const effort = reasoning?.effort;
  const thinkingLevelMap: ThinkingLevelMap | undefined = reasoning?.supported && effort?.length
    ? Object.fromEntries(["off", "minimal", "low", "medium", "high", "xhigh", "max"].map((level) => {
        const value = level === "off" ? "none" : level;
        return [level, effort.includes(value) ? value : null];
      }))
    : undefined;
  const cost = metadata.cost?.text;
  const cacheWrite = cost?.input?.cache?.write;
  return {
    id,
    name: name || id,
    api: selected.api,
    // Pi's Anthropic SDK adds its own /v1 segment.
    baseUrl: selected.protocol === "messages" ? baseUrl.slice(0, -3) : baseUrl,
    // Go's Chat Completions adapter uses max_tokens and has no store option.
    ...(selected.protocol === "chat-completions" ? { compat: { maxTokensField: "max_tokens", supportsStore: false } } : {}),
    reasoning: reasoning?.supported === true,
    thinkingLevelMap,
    input: metadata.modalities?.input?.some((type) => type.startsWith("image/")) ? ["text", "image"] : ["text"],
    contextWindow: metadata.limit?.context,
    maxTokens: metadata.limit?.output,
    cost: {
      input: clampCostValue(cost?.input?.price),
      output: clampCostValue(cost?.output?.price),
      cacheRead: clampCostValue(cost?.input?.cache?.read),
      // Pi's model cost has one write rate. Prefer the shortest published retention.
      cacheWrite: clampCostValue(typeof cacheWrite === "object" && cacheWrite
        ? cacheWrite["5m"] ?? cacheWrite["30m"] ?? cacheWrite["1h"] ?? cacheWrite["12h"]
        : cacheWrite),
    },
  };
}
