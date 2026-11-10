import type {
  PsmProjectIdentity,
  PsmProjectIdentityAvatar,
  PsmProjectIdentityProviderRegistration,
  PsmProjectReference,
} from "@dwsy/plugin-sdk";

const DEFAULT_PRIORITY = 100;
const MAX_LABEL_LENGTH = 200;
const MAX_SUBTITLE_LENGTH = 300;
const AVATAR_KINDS = new Set<PsmProjectIdentityAvatar["kind"]>([
  "initial",
  "emoji",
  "url",
]);

/** Stable, non-negative hue for any string, so repeated renders keep the same color. */
export function hueFromString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

function normalizeHue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.round(((value % 360) + 360) % 360);
}

function normalizeAvatar(value: unknown): PsmProjectIdentityAvatar | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  const text = candidate.value;
  if (typeof kind !== "string" || !AVATAR_KINDS.has(kind as PsmProjectIdentityAvatar["kind"])) {
    return undefined;
  }
  if (typeof text !== "string") return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (kind === "url" && !/^(https?:|data:image\/)/i.test(trimmed)) return undefined;
  return {
    kind: kind as PsmProjectIdentityAvatar["kind"],
    value: kind === "initial" ? trimmed.slice(0, 1) : trimmed,
    hue: normalizeHue(candidate.hue),
  };
}

/** Validates untrusted plugin output. Invalid identities are ignored, never rendered. */
export function normalizeProjectIdentity(value: unknown): PsmProjectIdentity | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.label !== "string") return null;
  const label = candidate.label.trim();
  if (!label) return null;

  const identity: PsmProjectIdentity = {
    label: label.slice(0, MAX_LABEL_LENGTH),
  };
  if (typeof candidate.subtitle === "string" && candidate.subtitle.trim()) {
    identity.subtitle = candidate.subtitle.trim().slice(0, MAX_SUBTITLE_LENGTH);
  }
  const avatar = normalizeAvatar(candidate.avatar);
  if (avatar) identity.avatar = avatar;
  if (candidate.hidePath === true) identity.hidePath = true;
  return identity;
}

function priorityOf(provider: PsmProjectIdentityProviderRegistration): number {
  return typeof provider.priority === "number" && Number.isFinite(provider.priority)
    ? provider.priority
    : DEFAULT_PRIORITY;
}

function sortProviders(
  providers: readonly PsmProjectIdentityProviderRegistration[],
): PsmProjectIdentityProviderRegistration[] {
  return [...providers].sort(
    (a, b) => priorityOf(a) - priorityOf(b) || a.id.localeCompare(b.id),
  );
}

function defaultProjectIdentity(project: PsmProjectReference): PsmProjectIdentity {
  return { label: project.name || project.path };
}

/**
 * Resolves the display identity of a project.
 *
 * Plugin providers win in priority order; the first valid identity is used. With no
 * provider the identity is the plain directory basename, exactly as before the API
 * existed. A provider
 * that throws or returns garbage is skipped so a broken plugin cannot break the list.
 */
export function resolveProjectIdentity(
  project: PsmProjectReference,
  providers: readonly PsmProjectIdentityProviderRegistration[] = [],
): PsmProjectIdentity {
  for (const provider of sortProviders(providers)) {
    let candidate: unknown;
    try {
      candidate = provider.resolve({
        path: project.path,
        name: project.name,
      });
    } catch (error) {
      console.warn(
        `[PSM plugins] Project identity provider failed: ${provider.id}`,
        error,
      );
      continue;
    }
    const identity = normalizeProjectIdentity(candidate);
    if (identity) return identity;
  }
  return defaultProjectIdentity(project);
}
