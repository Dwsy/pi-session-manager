import { CalendarDays, Check, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DashboardTimeOptions, DashboardTimeSelection, DashboardTimeGranularity } from './dashboardTimeRange'

interface DashboardTimeFilterProps {
  selection: DashboardTimeSelection
  options: DashboardTimeOptions
  rangeLabel: string
  resultCount: number
  totalCount: number
  onChange: (selection: DashboardTimeSelection) => void
}

const GRANULARITIES: DashboardTimeGranularity[] = ['recent', 'week', 'month', 'year', 'day', 'all']

export default function DashboardTimeFilter({ selection, options, rangeLabel, resultCount, totalCount, onChange }: DashboardTimeFilterProps) {
  const { t } = useTranslation()
  const updateGranularity = (granularity: DashboardTimeGranularity) => onChange({ ...selection, granularity })
  const needsYear = !['recent', 'all'].includes(selection.granularity)
  const needsMonth = ['month', 'week', 'day'].includes(selection.granularity)
  const needsDay = ['week', 'day'].includes(selection.granularity)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border/70 bg-card/35 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('dashboard.timeFilter.title', 'Time range')}</span>
      </div>
      <div className="flex max-w-full overflow-x-auto rounded border border-border" role="group" aria-label={t('dashboard.timeFilter.granularity', 'Time granularity')}>
        {GRANULARITIES.map((granularity) => {
          const active = selection.granularity === granularity
          return (
            <button
              key={granularity}
              type="button"
              onClick={() => updateGranularity(granularity)}
              aria-pressed={active}
              className={`focus-ring flex h-7 shrink-0 items-center gap-1 border-r border-border px-2 text-[10px] last:border-r-0 ${active ? 'theme-accent-bg-soft theme-accent-ring theme-accent-fg font-semibold' : 'bg-background/20 font-medium text-foreground/80 hover:bg-muted/40 hover:text-foreground'}`}
            >
              {active ? <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" /> : null}
              <span>{t(`dashboard.timeFilter.${granularity}`, granularity)}</span>
            </button>
          )
        })}
      </div>

      {needsYear ? (
        <select value={selection.year} onChange={(event) => onChange({ ...selection, year: Number(event.target.value) })} aria-label={t('dashboard.timeFilter.year', 'Year')} className="focus-ring h-7 rounded border border-border bg-background px-2 text-[10px] text-foreground">
          {options.years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      ) : null}
      {needsMonth ? (
        <select value={selection.month} onChange={(event) => onChange({ ...selection, month: Number(event.target.value) })} aria-label={t('dashboard.timeFilter.month', 'Month')} className="focus-ring h-7 rounded border border-border bg-background px-2 text-[10px] text-foreground">
          {options.months.map((month) => <option key={month} value={month}>{t('dashboard.timeFilter.monthValue', 'Month {{month}}', { month })}</option>)}
        </select>
      ) : null}
      {needsDay ? (
        <select value={selection.day} onChange={(event) => onChange({ ...selection, day: Number(event.target.value) })} aria-label={selection.granularity === 'week' ? t('dashboard.timeFilter.weekAnchor', 'A day inside the week') : t('dashboard.timeFilter.day', 'Day')} className="focus-ring h-7 rounded border border-border bg-background px-2 text-[10px] text-foreground">
          {options.days.map((day) => <option key={day} value={day}>{t('dashboard.timeFilter.dayValue', 'Day {{day}}', { day })}</option>)}
        </select>
      ) : null}

      <div className="min-w-0 flex-1 text-right text-[10px] text-muted-foreground">
        {rangeLabel ? <span className="mr-2 text-foreground">{rangeLabel}</span> : null}
        <span>{t('dashboard.timeFilter.resultCount', '{{count}} / {{total}} sessions', { count: resultCount, total: totalCount })}</span>
      </div>

      {selection.granularity !== 'recent' ? (
        <button type="button" onClick={() => updateGranularity('recent')} className="focus-ring flex h-7 items-center gap-1 rounded border border-border px-2 text-[10px] text-muted-foreground hover:bg-muted/30 hover:text-foreground">
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          {t('dashboard.timeFilter.reset', 'Default range')}
        </button>
      ) : null}
    </div>
  )
}
