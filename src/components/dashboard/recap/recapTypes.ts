import type { SessionInfo, SessionStats } from '@/types'

/**
 * Shared contracts for the dashboard recap.
 *
 * Everything downstream of `buildRecapStory` consumes only these types, so the
 * story composer, the moment detectors, and the presentation layer can evolve
 * independently. All user-facing copy travels as `RecapText` descriptors —
 * a translation key plus an English fallback — so the pure data layer never
 * touches i18n directly.
 */

/** A translatable string: resolved by the UI as `t(key, fallback, values)`. */
export interface RecapText {
  key: string
  fallback: string
  values?: Record<string, string | number>
}

/* ------------------------------------------------------------------ *
 * Periods
 * ------------------------------------------------------------------ */

export type RecapPeriodKind = 'week' | 'month' | 'quarter' | 'midyear' | 'year'

export interface RecapPeriod {
  kind: RecapPeriodKind
  /** Stable identity of one cycle, e.g. `month:2026-03` or `week:2026-W11`. */
  cycleKey: string
  /** Local 00:00:00.000 of the first day. */
  start: Date
  /** Local 23:59:59.999 of the last day (inclusive). */
  end: Date
  /** ISO year for weeks; calendar year otherwise. */
  year: number
  label: RecapText
}

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

export interface RecapInput {
  period: RecapPeriod
  /** Sessions that fall inside the period. */
  sessions: SessionInfo[]
  /** Every session on the machine, for lifetime comparisons. */
  allSessions: SessionInfo[]
  /** Stats already scoped to the period by the caller. */
  stats: SessionStats
  /** The only clock the composer reads, so stories are reproducible. */
  now: Date
}

/* ------------------------------------------------------------------ *
 * Moments — the badges a period can earn
 * ------------------------------------------------------------------ */

export type RecapMomentId =
  | 'nightOwl'
  | 'dawnBreaker'
  | 'ironStreak'
  | 'marathon'
  | 'polyglot'
  | 'oneTrueProject'
  | 'comeback'
  | 'weekendBuilder'
  | 'anniversary'
  | 'firstLight'
  | 'cacheWhisperer'
  | 'quietCraft'

export type RecapMomentRarity = 'legendary' | 'rare' | 'common'

export type RecapMomentIcon =
  | 'moon'
  | 'sunrise'
  | 'flame'
  | 'infinity'
  | 'compass'
  | 'anchor'
  | 'sparkles'
  | 'trophy'
  | 'heart'
  | 'mountain'
  | 'clover'
  | 'ghost'

export interface RecapMoment {
  id: RecapMomentId
  rarity: RecapMomentRarity
  icon: RecapMomentIcon
  title: RecapText
  detail: RecapText
}

/* ------------------------------------------------------------------ *
 * Summary — the period reduced to a single card
 * ------------------------------------------------------------------ */

export type RecapStatIcon =
  | 'sessions'
  | 'messages'
  | 'tokens'
  | 'cost'
  | 'days'
  | 'streak'
  | 'clock'
  | 'project'
  | 'model'
  | 'cache'
  | 'average'
  | 'subagent'

export interface RecapStat {
  key: string
  icon: RecapStatIcon
  label: RecapText
  value: number | string
  /** Preformatted rendering of `value`, e.g. `1.2M` for tokens. */
  display?: string
  /** Secondary line, e.g. `62% of everything you opened`. */
  hint?: RecapText
}

/**
 * Derived once by the composer so the opening cover and the closing card
 * cannot drift apart.
 */
export interface RecapSummary {
  /** The four numbers that define the period. */
  headline: RecapStat[]
  /** Supporting stats, at most eight, ordered by how much they say. */
  detail: RecapStat[]
  /** Normalized 0..1 daily activity across the period, for the cover strip. */
  pulse: number[]
}

/* ------------------------------------------------------------------ *
 * Scenes
 * ------------------------------------------------------------------ */

export type RecapSceneId =
  | 'opening'
  | 'volume'
  | 'busiestDay'
  | 'rhythm'
  | 'streak'
  | 'companion'
  | 'voice'
  | 'deepDive'
  | 'firstWords'
  | 'moments'
  | 'closing'
  | 'summary'

/** Drives the background treatment of a scene; not a semantic category. */
export type RecapSceneTone = 'calm' | 'bright' | 'warm' | 'deep'

export interface RecapMetric {
  key: string
  label: RecapText
  value: number | string
  /** Preformatted rendering of `value`, e.g. `1.2M` for tokens. */
  display?: string
  unit?: RecapText
}

export type RecapVisual =
  | { type: 'none' }
  /** Normalized 0..1 activity values across the period window. */
  | { type: 'sparkline'; points: number[] }
  /** 24 normalized 0..1 buckets plus the hour the dial should highlight. */
  | { type: 'clockDial'; hours: number[]; peakHour: number }
  /** One flag per local day, oldest first. */
  | { type: 'streakRibbon'; days: boolean[]; activeLabel?: RecapText }
  | { type: 'quote'; text: string; caption?: RecapText }
  | { type: 'moments'; moments: RecapMoment[] }
  /** Headline tiles plus an activity strip; the story's cover. */
  | { type: 'overview'; stats: RecapStat[]; pulse: number[] }
  /** The whole period on one exportable card; the story's finale. */
  | {
      type: 'summaryGrid'
      headline: RecapStat[]
      detail: RecapStat[]
      moments: RecapMoment[]
    }

export interface RecapScene {
  id: RecapSceneId
  tone: RecapSceneTone
  eyebrow: RecapText
  title: RecapText
  metrics: RecapMetric[]
  body?: RecapText
  footnote?: RecapText
  visual: RecapVisual
}

/* ------------------------------------------------------------------ *
 * Story
 * ------------------------------------------------------------------ */

export interface RecapStory {
  period: RecapPeriod
  scenes: RecapScene[]
  moments: RecapMoment[]
  /** The period on one card, shared by the cover, the finale, and the export. */
  summary: RecapSummary
  /** 0..359 hue derived from the dominant project, so each period has a stable tint. */
  accentHue: number
  isEmpty: boolean
}
