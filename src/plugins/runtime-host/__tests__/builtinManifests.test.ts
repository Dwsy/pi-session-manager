import { describe, expect, it } from 'vitest'

import { validatePsmPluginManifest } from '@dwsy/plugin-sdk'

// Every built-in plugin declares its manifest next to its entry. The host rejects a
// plugin whose manifest fails validation, and the only user-facing symptom is a
// missing feature, so validate all of them here instead.
const manifestModules = import.meta.glob('../../../../extensions/psm-*/manifest.ts', {
  eager: true,
}) as Record<string, { manifest?: unknown; default?: unknown }>

const entries = Object.entries(manifestModules).map(([path, module]) => ({
  path,
  manifest: module.manifest ?? module.default,
}))

describe('built-in plugin manifests', () => {
  it('finds the built-in manifests', () => {
    expect(entries.length).toBeGreaterThan(5)
  })

  it.each(entries.map(({ path, manifest }) => [path, manifest] as const))(
    '%s passes SDK manifest validation',
    (_path, manifest) => {
      expect(validatePsmPluginManifest(manifest)).toEqual({ ok: true, errors: [] })
    },
  )

  it('uses unique plugin ids', () => {
    const ids = entries.map(({ manifest }) => (manifest as { id?: string })?.id ?? '')
    expect(new Set(ids).size).toBe(ids.length)
  })
})
