import { describe, expect, it } from 'vitest'

import {
  bloubAvatarDataUrl,
  bloubAvatarProfile,
  bloubAvatarSvg,
  stableIndex,
} from './bloubAvatar'
import {
  BLOUB_EXPRESSIONS,
  BLOUB_SHAPES,
  BLOUB_SUPPORTED_SHAPES,
  BLOUB_UNSUPPORTED_SHAPE,
} from './bloubTable'

/** The real seeds OpenBot stores for the local agents. */
const ZERO_SEED = 'first-bot:avatar:0:7'
const DEE_SEED = 'first-bot:avatar:0:19'

const svgFromDataUrl = (dataUrl: string) =>
  atob(dataUrl.slice(dataUrl.indexOf(',') + 1))

describe('bloubAvatarProfile', () => {
  it('matches the profiles OpenBot renders for the real agents', () => {
    expect(bloubAvatarProfile(ZERO_SEED, 320)).toMatchObject({
      shape: 'nuage',
      expression: 'curieux',
      color: '#e152b0',
    })
    expect(bloubAvatarProfile(DEE_SEED, 215)).toMatchObject({
      shape: 'galet',
      expression: 'colere',
      color: '#3b93f0',
    })
  })

  it('keeps hue and shape decisions independent', () => {
    const rose = bloubAvatarProfile(ZERO_SEED, 320)
    const blue = bloubAvatarProfile(ZERO_SEED, 215)

    expect(blue.shape).toBe(rose.shape)
    expect(blue.expression).toBe(rose.expression)
    expect(blue.color).toBe('#3b93f0')
  })

  it('falls back to the automatic palette when no hue is stored', () => {
    const profile = bloubAvatarProfile(ZERO_SEED, null)

    expect(profile.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(profile.color).toBe(bloubAvatarProfile(ZERO_SEED, undefined).color)
  })

  it('replaces the unsupported silhouette the way OpenBot does', () => {
    const seed = Array.from({ length: 2000 }, (_, index) => `probe-${index}`).find(
      (candidate) => BLOUB_SHAPES[stableIndex(`${candidate}:shape`, BLOUB_SHAPES.length)] === BLOUB_UNSUPPORTED_SHAPE,
    )

    expect(seed).toBeTruthy()
    const profile = bloubAvatarProfile(seed as string, 320)

    expect(profile.shape).not.toBe(BLOUB_UNSUPPORTED_SHAPE)
    expect(BLOUB_SUPPORTED_SHAPES).toContain(profile.shape)
    expect(BLOUB_EXPRESSIONS).toContain(profile.expression)
  })

  it('is deterministic', () => {
    expect(bloubAvatarProfile(ZERO_SEED, 320)).toEqual(bloubAvatarProfile(ZERO_SEED, 320))
  })
})

describe('bloubAvatarSvg', () => {
  it('draws the body with the hue colour and both eyes clipped by the mask', () => {
    const svg = bloubAvatarSvg(ZERO_SEED, 320)

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-158 -158 316 316"')).toBe(true)
    expect(svg).toContain('fill="#e152b0"')
    expect(svg).toContain('<mask id="bloub"')
    expect(svg.match(/<path /g)?.length).toBe(4)
    expect(svg).toMatch(/^[\x20-\x7e]+$/)
  })

  it('draws different faces for different seeds', () => {
    expect(bloubAvatarSvg(ZERO_SEED, 320)).not.toBe(bloubAvatarSvg(DEE_SEED, 320))
  })
})

describe('bloubAvatarDataUrl', () => {
  it('produces a base64 svg data url the host can render in an img', () => {
    const dataUrl = bloubAvatarDataUrl(ZERO_SEED, 320)

    expect(dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(svgFromDataUrl(dataUrl)).toBe(bloubAvatarSvg(ZERO_SEED, 320))
  })
})
