import { ICON_GLYPHS, type IconGlyph } from './iconTable'

/** Favicon-style brand mark rendered as a data URL; no runtime dependency, no emoji. */
export interface ProjectIcon {
  dataUrl: string
}

/** White glyph on the brand-color disc so marks stay legible on dark and light rows. */
function svgDataUrl(glyph: IconGlyph): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<circle cx="12" cy="12" r="12" fill="#${glyph.hex}"/>` +
    `<path transform="translate(2.64 2.64) scale(0.78)" d="${glyph.path}" fill="#fff"/>` +
    `</svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

const CACHE: Record<string, ProjectIcon> = {}

/**
 * Kind -> icon lookup. Kinds are the normalized ids produced by the backend
 * `plugin_project_detect` command; unmapped kinds fall back to the host folder icon.
 */
export function iconForKind(kind: string | null | undefined): ProjectIcon | null {
  if (typeof kind !== 'string') return null
  const key = kind.trim().toLowerCase()
  const glyph = ICON_GLYPHS[key]
  if (!glyph) return null
  CACHE[key] ??= { dataUrl: svgDataUrl(glyph) }
  return CACHE[key]
}
