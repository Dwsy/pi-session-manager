import {
  BLOUB_AUTOMATIC_COLORS,
  BLOUB_BODY_PATHS,
  BLOUB_EXPRESSIONS,
  BLOUB_EYE_PATHS,
  BLOUB_EYE_TRANSFORMS,
  BLOUB_HUE_HEX,
  BLOUB_SHAPES,
  BLOUB_SUPPORTED_SHAPES,
  BLOUB_UNSUPPORTED_SHAPE,
} from './bloubTable'

export interface BloubAvatarProfile {
  shape: string
  shapeIndex: number
  expression: string
  expressionIndex: number
  /** Body fill, taken from the same hue table OpenBot uses. */
  color: string
}

/** FNV-1a, identical to `stableIndex` in @openbot/brand, so indices match OpenBot exactly. */
export function stableIndex(value: string, length: number): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % length
}

/**
 * Mirrors `bloubAvatarProfile(seed, hue)` from @openbot/brand, including the
 * `goutte` silhouette replacement OpenBot applies to unsupported shapes.
 */
export function bloubAvatarProfile(
  seed: string,
  hue: number | null | undefined,
): BloubAvatarProfile {
  const storedShape = BLOUB_SHAPES[stableIndex(`${seed}:shape`, BLOUB_SHAPES.length)]
  const shape =
    storedShape === BLOUB_UNSUPPORTED_SHAPE
      ? BLOUB_SUPPORTED_SHAPES[
          stableIndex(`${seed}:shape:replacement`, BLOUB_SUPPORTED_SHAPES.length)
        ]
      : storedShape
  const expression = BLOUB_EXPRESSIONS[stableIndex(`${seed}:expression`, BLOUB_EXPRESSIONS.length)]

  return {
    shape,
    shapeIndex: BLOUB_SHAPES.indexOf(shape),
    expression,
    expressionIndex: BLOUB_EXPRESSIONS.indexOf(expression),
    color:
      typeof hue === 'number' && BLOUB_HUE_HEX[hue]
        ? BLOUB_HUE_HEX[hue]
        : BLOUB_AUTOMATIC_COLORS[stableIndex(`${seed}:color`, BLOUB_AUTOMATIC_COLORS.length)],
  }
}

/**
 * Static SVG for one agent avatar. Geometry is precomputed from @norbert_bodziony/bloub,
 * so this is a string assembly and needs neither React nor a DOM.
 */
export function bloubAvatarSvg(seed: string, hue: number | null | undefined): string {
  const profile = bloubAvatarProfile(seed, hue)
  const body = BLOUB_BODY_PATHS[profile.shapeIndex]
  const [leftEye, rightEye] = BLOUB_EYE_PATHS[profile.expressionIndex]
  const [leftTransform, rightTransform] = BLOUB_EYE_TRANSFORMS[profile.shapeIndex][profile.expressionIndex]

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-158 -158 316 316" width="100" height="100" aria-hidden="true" focusable="false">' +
    '<defs><mask id="bloub" maskUnits="userSpaceOnUse" x="-158" y="-158" width="316" height="316">' +
    `<path d="${body}" fill="#fff"/>` +
    `<path d="${leftEye}" transform="${leftTransform}" fill="#000"/>` +
    `<path d="${rightEye}" transform="${rightTransform}" fill="#000"/>` +
    '</mask></defs>' +
    `<g><path d="${body}" fill="#f9f9f9"/>` +
    `<g mask="url(#bloub)"><rect x="-158" y="-158" width="316" height="316" fill="${profile.color}"/></g></g>` +
    '</svg>'
  )
}

// The generated SVG is pure ASCII (path data and hex colours), so btoa is enough.
function toBase64(value: string): string {
  return btoa(value)
}

/** `data:` URL so the host can render the avatar with a plain `<img>`. */
export function bloubAvatarDataUrl(seed: string, hue: number | null | undefined): string {
  return `data:image/svg+xml;base64,${toBase64(bloubAvatarSvg(seed, hue))}`
}

const dataUrlCache = new Map<string, string>()

/** Cached per seed+hue, since identities resolve on every render pass. */
export function cachedBloubAvatarDataUrl(seed: string, hue: number | null | undefined): string {
  const key = `${seed}\u0000${hue ?? ''}`
  const cached = dataUrlCache.get(key)
  if (cached) return cached
  const dataUrl = bloubAvatarDataUrl(seed, hue)
  dataUrlCache.set(key, dataUrl)
  return dataUrl
}
