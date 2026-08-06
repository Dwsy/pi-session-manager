import { invoke, isTauri } from "@/transport";
import type { SessionConvertTarget, SessionProviderInfo } from "@/types";

interface RawSessionProviderInfo {
  slug?: string;
  display_name?: string;
  displayName?: string;
  capabilities?: {
    canScan?: boolean;
    canConvertTarget?: boolean;
  };
}

const FALLBACK_PROVIDERS: SessionProviderInfo[] = [
  {
    slug: "pi",
    display_name: "Pi",
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: "omp",
    display_name: "OMP",
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: "claude-code",
    display_name: "Claude Code",
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: "codex",
    display_name: "Codex",
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: "opencode",
    display_name: "OpenCode",
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: "gemini",
    display_name: "Gemini CLI",
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: "factory",
    display_name: "Factory",
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: "clawdbot",
    display_name: "ClawdBot",
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: "cursor",
    display_name: "Cursor",
    capabilities: { canScan: true, canConvertTarget: false },
  },
  {
    slug: "antigravity",
    display_name: "Antigravity",
    capabilities: { canScan: true, canConvertTarget: false },
  },
];

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

export async function listSupportedSessionProviders(): Promise<SessionProviderInfo[]> {
  if (!isTauri()) {
    return FALLBACK_PROVIDERS;
  }

  try {
    const providers = await invoke<RawSessionProviderInfo[]>(
      "list_supported_session_providers",
    );
    const normalized = providers
      .map((item) => {
        const slug = normalizeProviderSlug(item.slug ?? "");
        if (!slug) return null;
        return {
          slug,
          display_name: item.display_name ?? item.displayName ?? slug,
          capabilities: {
            canScan: item.capabilities?.canScan ?? true,
            canConvertTarget: item.capabilities?.canConvertTarget ?? true,
          },
        } satisfies SessionProviderInfo;
      })
      .filter((item): item is SessionProviderInfo => item !== null);

    return normalized.length > 0 ? normalized : FALLBACK_PROVIDERS;
  } catch (error) {
    console.warn("Failed to load supported session providers, using fallback:", error);
    return FALLBACK_PROVIDERS;
  }
}
