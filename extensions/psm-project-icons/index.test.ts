import { describe, expect, it, vi } from 'vitest'

import activate, {
  buildDetectionIndex,
  pathKey,
  PROVIDER_ID,
  PROVIDER_PRIORITY,
  resolveProjectIconIdentity,
} from './index'
import { iconForKind } from './icons'
import { ICON_GLYPHS } from './iconTable'
import type { PsmProjectDetection, PsmPluginHostContext } from '@dwsy/plugin-sdk'

function detection(overrides: Partial<PsmProjectDetection> = {}): PsmProjectDetection {
  return {
    path: '/Users/dev/Projects/demo',
    name: 'demo',
    authorized: true,
    kind: 'rust',
    ...overrides,
  }
}

function decodeSvg(dataUrl: string): string {
  expect(dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true)
  return atob(dataUrl.slice('data:image/svg+xml;base64,'.length))
}

describe('icons', () => {
  it('renders every known kind as a favicon-style SVG brand mark', () => {
    for (const kind of Object.keys(ICON_GLYPHS)) {
      const icon = iconForKind(kind)
      expect(icon, kind).not.toBeNull()
      const svg = decodeSvg(icon!.dataUrl)
      expect(svg, kind).toContain('<svg')
      expect(svg, kind).toContain(`#${ICON_GLYPHS[kind].hex}`)
    }
  })

  it('renders marks as url avatars, never emoji', () => {
    for (const kind of Object.keys(ICON_GLYPHS)) {
      const index = buildDetectionIndex([detection({ kind })])
      const identity = resolveProjectIconIdentity({ path: '/Users/dev/Projects/demo', name: 'demo' }, index)
      expect(identity?.avatar?.kind, kind).toBe('url')
    }
  })

  it('returns null for unknown or malformed kinds', () => {
    expect(iconForKind('brainfuck')).toBeNull()
    expect(iconForKind(null)).toBeNull()
    expect(iconForKind(undefined)).toBeNull()
  })
})

describe('buildDetectionIndex', () => {
  it('keys detections by normalized path', () => {
    const index = buildDetectionIndex([detection({ path: '/Users/dev/Projects/Demo/' })])
    expect(index.get(pathKey('\\users\\dev\\projects\\demo'))).toBeTruthy()
  })

  it('drops unauthorized, unknown-kind and malformed entries', () => {
    const index = buildDetectionIndex([
      detection({ path: '/a', authorized: false }),
      detection({ path: '/b', kind: null }),
      detection({ path: '' }),
      null as unknown as PsmProjectDetection,
    ])
    expect(index.size).toBe(0)
  })
})

describe('resolveProjectIconIdentity', () => {
  it('keeps the project label and swaps the folder icon for the brand mark', () => {
    const index = buildDetectionIndex([detection({ kind: 'react' })])
    const identity = resolveProjectIconIdentity(
      { path: '/Users/dev/Projects/demo', name: 'demo' },
      index,
    )
    expect(identity).toEqual({
      label: 'demo',
      avatar: { kind: 'url', value: iconForKind('react')!.dataUrl },
    })
    expect(identity).not.toHaveProperty('hidePath')
    expect(identity).not.toHaveProperty('subtitle')
  })

  it('defers to the host folder icon for unknown or unmapped projects', () => {
    const index = buildDetectionIndex([detection()])
    expect(resolveProjectIconIdentity({ path: '/somewhere/else', name: 'else' }, index)).toBeNull()

    const unmapped = buildDetectionIndex([detection({ kind: 'future-kind' })])
    expect(resolveProjectIconIdentity({ path: '/Users/dev/Projects/demo', name: 'demo' }, unmapped)).toBeNull()
  })
})

describe('activate', () => {
  function fakeCtx(detect: () => Promise<PsmProjectDetection[]>) {
    const registerProjectIdentityProvider = vi.fn()
    const warn = vi.fn()
    const ctx = {
      psm: { projects: { detect } },
      ui: { registerProjectIdentityProvider },
      log: { warn },
    } as unknown as PsmPluginHostContext
    return { ctx, registerProjectIdentityProvider, warn }
  }

  it('registers one provider over the detection cache', async () => {
    const { ctx, registerProjectIdentityProvider } = fakeCtx(async () => [detection()])
    await activate(ctx)

    expect(registerProjectIdentityProvider).toHaveBeenCalledTimes(1)
    const registration = registerProjectIdentityProvider.mock.calls[0][0]
    expect(registration.id).toBe(PROVIDER_ID)
    expect(registration.priority).toBe(PROVIDER_PRIORITY)
    expect(registration.resolve({ path: '/Users/dev/Projects/demo', name: 'demo' })).toEqual({
      label: 'demo',
      avatar: { kind: 'url', value: iconForKind('rust')!.dataUrl },
    })
  })

  it('keeps folder icons and logs when detection is unavailable', async () => {
    const { ctx, registerProjectIdentityProvider, warn } = fakeCtx(async () => {
      throw new Error('permission denied')
    })
    await activate(ctx)

    expect(registerProjectIdentityProvider).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('registers nothing when no project is recognized', async () => {
    const { ctx, registerProjectIdentityProvider } = fakeCtx(async () => [])
    await activate(ctx)
    expect(registerProjectIdentityProvider).not.toHaveBeenCalled()
  })
})
