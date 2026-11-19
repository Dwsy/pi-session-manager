import { CalendarDays, Check, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  shiftDashboardWeekSelection,
  type DashboardTimeOptions,
  type DashboardTimeSelection,
  type DashboardTimeGranularity,
} from './dashboardTimeRange'

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
  const isWeek = selection.granularity === 'week'
  const needsYear = ['year', 'month', 'day'].includes(selection.granularity)
  const needsMonth = ['month', 'day'].includes(selection.granularity)
  const needsDay = selection.granularity === 'day'
  const moveWeek = (offsetWeeks: number) => onChange(shiftDashboardWeekSelection(selection, offsetWeeks))

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/75 bg-card/95 px-3 py-2 shadow-[shadow:var(--shadow-card)]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium leading-4 text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('dashboard.timeFilter.title', 'Time range')}</span>
      </div>
      <div className="grid w-full grid-cols-3 overflow-hidden rounded-md border border-border/75 bg-surface/65 sm:inline-flex sm:w-auto" role="group" aria-label={t('dashboard.timeFilter.granularity', 'Time granularity')}>
        {GRANULARITIES.map((granularity) => {
          const active = selection.granularity === granularity
          return (
            <button
              key={granularity}
              type="button"
              onClick={() => updateGranularity(granularity)}
              aria-pressed={active}
              className={`focus-ring flex h-7 min-w-0 shrink-0 items-center justify-center gap-1 whitespace-nowrap border-b border-r border-border/75 px-1.5 text-[11px] leading-4 first:rounded-l-[5px] last:rounded-r-[5px] sm:justify-start sm:border-b-0 sm:px-2.5 [&:nth-child(n+4)]:border-b-0 [&:nth-child(3)]:border-r-0 sm:[&:nth-child(3)]:border-r last:border-r-0 motion-color ${active ? 'theme-accent-bg-soft theme-accent-ring theme-accent-fg font-semibold' : 'font-medium text-foreground/85 hover:bg-secondary/75 hover:text-foreground'}`}
            >
              {active ? <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" /> : null}
              <span className="truncate">{t(`dashboard.timeFilter.${granularity}`, granularity)}</span>
            </button>
          )
        })}
      </div>

      {isWeek ? (
        <div className="flex overflow-hidden rounded-md border border-border/75 bg-surface/65" role="group" aria-label={t('dashboard.timeFilter.weekNavigation', 'Week navigation')}>
          <button type="button" onClick={() => moveWeek(-1)} className="focus-ring flex h-7 items-center gap-1 border-r border-border/75 px-2.5 text-[11px] font-medium leading-4 text-foreground/85 hover:bg-secondary/75 hover:text-foreground motion-color">
            <ChevronLeft className="h-3 w-3" aria-hidden="true" />
            {t('dashboard.timeFilter.previousWeek', 'Previous week')}
          </button>
          <button type="button" onClick={() => moveWeek(1)} className="focus-ring flex h-7 items-center gap-1 px-2.5 text-[11px] font-medium leading-4 text-foreground/85 hover:bg-secondary/75 hover:text-foreground motion-color">
            {t('dashboard.timeFilter.nextWeek', 'Next week')}
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          {needsYear ? (
            <select value={selection.year} onChange={(event) => onChange({ ...selection, year: Number(event.target.value) })} aria-label={t('dashboard.timeFilter.year', 'Year')} className="focus-ring h-7 rounded-md border border-border/75 bg-surface px-2 text-[11px] leading-4 tabular-nums text-foreground">
              {options.years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          ) : null}
          {needsMonth ? (
            <select value={selection.month} onChange={(event) => onChange({ ...selection, month: Number(event.target.value) })} aria-label={t('dashboard.timeFilter.month', 'Month')} className="focus-ring h-7 rounded-md border border-border/75 bg-surface px-2 text-[11px] leading-4 tabular-nums text-foreground">
              {options.months.map((month) => <option key={month} value={month}>{t('dashboard.timeFilter.monthValue', 'Month {{month}}', { month })}</option>)}
            </select>
          ) : null}
          {needsDay ? (
            <select value={selection.day} onChange={(event) => onChange({ ...selection, day: Number(event.target.value) })} aria-label={t('dashboard.timeFilter.day', 'Day')} className="focus-ring h-7 rounded-md border border-border/75 bg-surface px-2 text-[11px] leading-4 tabular-nums text-foreground">
              {options.days.map((day) => <option key={day} value={day}>{t('dashboard.timeFilter.dayValue', 'Day {{day}}', { day })}</option>)}
            </select>
          ) : null}
        </>
      )}

      <div className="min-w-0 flex-1 text-right text-[11px] leading-4 tabular-nums text-muted-foreground">
        {rangeLabel ? <span className="mr-2 font-medium text-foreground">{rangeLabel}</span> : null}
        <span>{t('dashboard.timeFilter.resultCount', '{{count}} / {{total}} sessions', { count: resultCount, total: totalCount })}</span>
      </div>

      {selection.granularity !== 'recent' ? (
        <button type="button" onClick={() => updateGranularity('recent')} className="focus-ring flex h-7 items-center gap-1 rounded-md border border-border/75 bg-surface/75 px-2.5 text-[11px] leading-4 text-muted-foreground hover:bg-secondary hover:text-foreground motion-color">
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          {t('dashboard.timeFilter.reset', 'Default range')}
        </button>
      ) : null}
    </div>
  )
}
