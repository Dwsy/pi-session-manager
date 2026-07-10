import type { ProviderEntry } from "./types";

export interface ProviderRemoteModel {
  id: string;
  name?: string | null;
  ownedBy?: string | null;
  created?: number | null;
}

export interface ProviderRemoteModelsResult {
  provider: string;
  url: string;
  api: string;
  latencyMs: number;
  models: ProviderRemoteModel[];
}

function joinUrl(base: string, suffix: string): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedSuffix = suffix.replace(/^\/+/, "");
  return `${trimmedBase}/${trimmedSuffix}`;
}

function resolveModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Provider baseUrl is required to fetch remote models");
  }
  if (trimmed.endsWith("/models")) return trimmed;
  return joinUrl(trimmed, "models");
}

async function resolveDynamicValue(raw: string): Promise<string> {
  const value = raw.trim();
  if (!value) return "";

  // Frontend cannot execute shell commands used by `!cmd` secrets.
  // Keep the raw value so Bearer still works for plain keys / env-like placeholders.
  if (value.startsWith("!")) {
    throw new Error(
      "Dynamic command secrets (!...) are not supported for frontend provider model listing. Use a plain API key value.",
    );
  }
  return value;
}

function extractModelEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;
  for (const key of ["data", "models", "items", "result"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }

  const nested = obj.data;
  if (nested && typeof nested === "object") {
    const nestedObj = nested as Record<string, unknown>;
    for (const key of ["data", "models", "items"]) {
      const value = nestedObj[key];
      if (Array.isArray(value)) return value;
    }
  }

  return [];
}

function parseRemoteModel(entry: unknown): ProviderRemoteModel | null {
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;

  const idRaw =
    (typeof obj.id === "string" && obj.id) ||
    (typeof obj.model === "string" && obj.model) ||
    (typeof obj.name === "string" && obj.name) ||
    "";
  const id = idRaw.trim();
  if (!id) return null;

  const nameRaw =
    (typeof obj.display_name === "string" && obj.display_name) ||
    (typeof obj.displayName === "string" && obj.displayName) ||
    (typeof obj.name === "string" && obj.name) ||
    "";
  const name = nameRaw.trim();

  const ownedByRaw =
    (typeof obj.owned_by === "string" && obj.owned_by) ||
    (typeof obj.ownedBy === "string" && obj.ownedBy) ||
    (typeof obj.organization === "string" && obj.organization) ||
    "";
  const ownedBy = ownedByRaw.trim();

  let created: number | null = null;
  const createdRaw = obj.created ?? obj.created_at;
  if (typeof createdRaw === "number" && Number.isFinite(createdRaw)) {
    created = createdRaw;
  } else if (typeof createdRaw === "string" && createdRaw.trim()) {
    const parsed = Number(createdRaw);
    if (Number.isFinite(parsed)) created = parsed;
  }

  return {
    id,
    name: name && name !== id ? name : null,
    ownedBy: ownedBy || null,
    created,
  };
}

export async function fetchProviderRemoteModels(
  providerName: string,
  provider: ProviderEntry,
  options: { timeoutMs?: number } = {},
): Promise<ProviderRemoteModelsResult> {
  const api = provider.api?.trim() || "openai-completions";
  if (api === "google-generative-ai") {
    throw new Error(
      "google-generative-ai remote model listing is not supported yet",
    );
  }

  const url = resolveModelsUrl(provider.baseUrl ?? "");
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (provider.headers) {
    for (const [key, value] of Object.entries(provider.headers)) {
      if (key.trim() && value != null) {
        headers.set(key, String(value));
      }
    }
  }

  const apiKey = provider.apiKey?.trim()
    ? await resolveDynamicValue(provider.apiKey)
    : "";

  if (provider.authHeader === true && apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  if (api === "anthropic-messages" && apiKey) {
    if (!headers.has("x-api-key")) {
      headers.set("x-api-key", apiKey);
    }
    if (!headers.has("anthropic-version")) {
      headers.set("anthropic-version", "2023-06-01");
    }
  }

  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? 20_000, 1_000),
    120_000,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const responseText = await response.text();

    if (!response.ok) {
      const preview = responseText.slice(0, 300);
      throw new Error(
        `Provider models endpoint returned HTTP ${response.status}: ${preview}`,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Provider models response is not valid JSON. Body preview: ${responseText.slice(0, 200)}`,
      );
    }

    const seen = new Set<string>();
    const models: ProviderRemoteModel[] = [];
    for (const entry of extractModelEntries(payload)) {
      const model = parseRemoteModel(entry);
      if (!model) continue;
      if (seen.has(model.id)) continue;
      seen.add(model.id);
      models.push(model);
    }

    models.sort((a, b) => a.id.localeCompare(b.id));
    if (models.length === 0) {
      throw new Error(
        "Provider models endpoint returned no recognizable model entries",
      );
    }

    return {
      provider: providerName,
      url,
      api,
      latencyMs,
      models,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Fetch provider models timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
