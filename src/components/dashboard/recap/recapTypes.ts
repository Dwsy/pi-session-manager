/** A translatable string: resolved by the UI as `t(key, fallback, values)`. */
export interface RecapText {
  key: string
  fallback: string
  values?: Record<string, string | number>
}

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
