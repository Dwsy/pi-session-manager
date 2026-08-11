import { getRuntimeMode } from "@/runtime-data/runtimeMode";
import { invoke } from "@/transport";
import type { SessionConvertTarget, SessionProviderInfo } from "@/types";

interface RawSessionProviderInfo {
  slug?: string;
  display_name?: string;
  displayName?: string;
  capabilities?: {
    canScan?: boolean;
    canConvertTarget?: boolean;
  };
  detected?: boolean;
  roots?: unknown;
}

/** Static provider table used when no backend is reachable (demo / dataset runtimes). */
export const FALLBACK_SESSION_PROVIDERS: SessionProviderInfo[] = (
  [
    ["pi", "Pi", true],
    ["omp", "OMP", true],
    ["claude-code", "Claude Code", true],
    ["codex", "Codex", true],
    ["opencode", "OpenCode", true],
    ["gemini", "Gemini CLI", true],
    ["factory", "Factory", true],
    ["clawdbot", "ClawdBot", true],
    ["cursor", "Cursor", false],
    ["antigravity", "Antigravity", false],
  ] as const
).map(([slug, displayName, canConvertTarget]) => ({
  slug,
  display_name: displayName,
  capabilities: { canScan: true, canConvertTarget },
  detected: false,
  roots: [],
}));

function normalizeProviderSlug(value: string): SessionConvertTarget | null {
  switch (value) {
    case "pi":
    case "omp":
    case "claude-code":
    case "codex":
    case "opencode":
    case "gemini":
    case "factory":
    case "clawdbot":
    case "cursor":
    case "antigravity":
      return value;
    default:
      return null;
  }
}

function normalizeRoots(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export async function listSupportedSessionProviders(): Promise<SessionProviderInfo[]> {
  if (getRuntimeMode() !== "backend") {
    return FALLBACK_SESSION_PROVIDERS;
  }

  try {
    const providers = await invoke<RawSessionProviderInfo[]>(
      "list_supported_session_providers",
    );
    const normalized = providers
      .map((item) => {
        const slug = normalizeProviderSlug(item.slug ?? "");
        if (!slug) return null;
        const roots = normalizeRoots(item.roots);
        return {
          slug,
          display_name: item.display_name ?? item.displayName ?? slug,
          capabilities: {
            canScan: item.capabilities?.canScan ?? true,
            canConvertTarget: item.capabilities?.canConvertTarget ?? true,
          },
          detected: item.detected ?? roots.length > 0,
          roots,
        } satisfies SessionProviderInfo;
      })
      .filter((item): item is SessionProviderInfo => item !== null);

    return normalized.length > 0 ? normalized : FALLBACK_SESSION_PROVIDERS;
  } catch (error) {
    console.warn("Failed to load supported session providers, using fallback:", error);
    return FALLBACK_SESSION_PROVIDERS;
  }
}
