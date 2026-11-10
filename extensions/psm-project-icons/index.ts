import type {
  PsmPluginHostContext,
  PsmProjectDetection,
  PsmProjectIdentity,
  PsmProjectReference,
} from '@dwsy/plugin-sdk'

import { iconForKind } from './icons'
import { manifest } from './manifest'

export { manifest }

export const PROVIDER_ID = 'builtin.project-icons.detected'
/** Decoration defers to identity: machine-directory renamers (priority <= 100) win. */
export const PROVIDER_PRIORITY = 200

/** Case/separator-insensitive key, because project paths differ across platforms. */
export function pathKey(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export type DetectionIndex = Map<string, PsmProjectDetection>

/**
 * Indexes detected projects by normalized path. Entries outside the auto-authorized
 * scan whitelist and malformed entries are dropped here so `resolve` stays trivial.
 */
export function buildDetectionIndex(detections: readonly PsmProjectDetection[]): DetectionIndex {
  const index: DetectionIndex = new Map()
  for (const detection of detections) {
    if (!detection || typeof detection.path !== 'string' || typeof detection.kind !== 'string') continue
    if (!detection.authorized || !detection.kind) continue
    const key = pathKey(detection.path)
    if (!key) continue
    index.set(key, detection)
  }
  return index
}

/**
 * Decorates a known project with its ecosystem icon while keeping the host's label
 * and path line untouched. Unknown or unrecognized projects return `null` so the host
 * keeps the default folder icon.
 */
export function resolveProjectIconIdentity(
  project: PsmProjectReference,
  detections: DetectionIndex,
): PsmProjectIdentity | null {
  const icon = iconForKind(detections.get(pathKey(project.path))?.kind)
  if (!icon) return null
  return {
    label: project.name || project.path,
    avatar: { kind: 'url', value: icon.dataUrl },
  }
}

/** Detection failure only costs icons; the host keeps rendering default folder icons. */
export default async function activate(ctx: PsmPluginHostContext) {
  let detections: PsmProjectDetection[]
  try {
    detections = await ctx.psm.projects.detect()
  } catch (error) {
    ctx.log.warn('Project marker detection unavailable; keeping folder icons', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return
  }

  const index = buildDetectionIndex(detections)
  if (index.size === 0) return

  ctx.ui.registerProjectIdentityProvider({
    id: PROVIDER_ID,
    priority: PROVIDER_PRIORITY,
    resolve: (project) => resolveProjectIconIdentity(project, index),
  })
}
