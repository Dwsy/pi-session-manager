import type { SessionConvertTarget, SessionProviderInfo } from "@/types";

/**
 * Every provider slug the backend can report, paired with its display name and
 * whether it can be a conversion target.
 *
 * Keep in sync with `ProviderKind` in `src-tauri/src/domain/casr_min/providers/mod.rs`.
 *
 * This module holds data only — no transport or runtime imports — so callers
 * that just need slug validation do not pull in the IPC layer.
 */
export const SESSION_PROVIDER_TABLE = [
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
  ["aider", "Aider", true],
  ["amp", "Amp", true],
  ["chatgpt", "ChatGPT", true],
  ["cline", "Cline", true],
  ["openclaw", "OpenClaw", true],
  ["vibe", "Vibe", true],
  ["kiro", "Kiro CLI", true],
  ["grok", "Grok Build", true],
] as const satisfies readonly (readonly [SessionConvertTarget, string, boolean])[];

/**
 * Compile-time guard: adding a slug to `SessionConvertTarget` without adding it
 * to the table above makes this alias resolve to `never` and fails the build.
 * Without it, a missing entry would silently drop the provider from the UI.
 */
type _EverySessionConvertTargetIsListed =
  Exclude<SessionConvertTarget, (typeof SESSION_PROVIDER_TABLE)[number][0]> extends never ? true : never;
const _everySessionConvertTargetIsListed: _EverySessionConvertTargetIsListed = true;
void _everySessionConvertTargetIsListed;

const SESSION_CONVERT_TARGETS = new Set<string>(SESSION_PROVIDER_TABLE.map(([slug]) => slug));

export function isSessionConvertTarget(value: unknown): value is SessionConvertTarget {
  return typeof value === "string" && SESSION_CONVERT_TARGETS.has(value);
}

/** Static provider table used when no backend is reachable (demo / dataset runtimes). */
export const FALLBACK_SESSION_PROVIDERS: SessionProviderInfo[] = SESSION_PROVIDER_TABLE.map(
  ([slug, displayName, canConvertTarget]) => ({
    slug,
    display_name: displayName,
    capabilities: { canScan: true, canConvertTarget },
    detected: false,
    roots: [],
  }),
);
