import { useTranslation } from 'react-i18next'
import {
  Search,
  User,
  Bot,
  Tag,
  FileText,
  ArrowUpDown,
  Star,
  Command,
} from 'lucide-react'
import type { MessageSearchPluginOptions } from '@/plugins/message/MessageSearchPlugin'
import type { FullTextSearchSourceFilter } from '@/types'
import {
  TABS,
  SOURCE_FILTERS,
  getTabLabel,
  getRoleFilterLabel,
  getSourceFilterLabel,
  getSortLabel,
} from './utils'
import type { CommandPaletteMode } from './commandActions'

interface CommandFilterBarProps {
  mode: CommandPaletteMode
  setMode: (mode: CommandPaletteMode) => void
  activeTab: 'all' | 'message' | 'session' | 'project'
  setActiveTab: (tab: 'all' | 'message' | 'session' | 'project') => void
  tabCounts: Record<'all' | 'message' | 'session' | 'project', number>
  supportsMessageFilters: boolean
  ftsOptions: MessageSearchPluginOptions
  setFtsOptions: (options: MessageSearchPluginOptions) => void
  effectiveSourceFilter: FullTextSearchSourceFilter
  onSourceFilterChange: (filter: FullTextSearchSourceFilter) => void
  effectiveSortMode: 'newest' | 'oldest' | 'score'
}

export default function CommandFilterBar({
  mode,
  setMode,
  activeTab,
  setActiveTab,
  tabCounts,
  supportsMessageFilters,
  ftsOptions,
  setFtsOptions,
  effectiveSourceFilter,
  onSourceFilterChange,
  effectiveSortMode,
}: CommandFilterBarProps) {
  const { t } = useTranslation()
  const showAdvancedMessageFilters = supportsMessageFilters

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
        {(['search', 'commands'] as const).map((value) => {
          const isActive = mode === value
          const Icon = value === 'search' ? Search : Command
          return (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                isActive
                  ? 'bg-foreground/[0.06] text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{value === 'search' ? t('command.mode.search', 'Search') : t('command.mode.commands', 'Commands')}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {mode === 'search' && TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-2 py-1.5 text-[12px] transition-colors ${
                isActive
                  ? 'border-foreground/10 bg-foreground/[0.06] text-foreground font-medium'
                  : 'border-border/70 bg-background text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <tab.Icon className="w-3.5 h-3.5" />
              <span>{getTabLabel(t, tab)}</span>
              {tabCounts[tab.id] > 0 && (
                <span
                  className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                    isActive
                      ? 'bg-foreground text-background'
                      : 'bg-surface text-muted-foreground'
                  }`}
                >
                  {tabCounts[tab.id]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {mode === 'search' && showAdvancedMessageFilters && (
        <>
          <div className="h-5 w-px bg-border/70" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
              {(['all', 'user', 'assistant'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() =>
                    setFtsOptions({
                      ...ftsOptions,
                      roleFilter: value,
                      page: 0,
                    })
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    ftsOptions.roleFilter === value
                      ? 'bg-foreground/[0.06] text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {value === 'all' && (
                    <>
                      <User className="w-3 h-3" />
                      <Bot className="w-3 h-3" />
                    </>
                  )}
                  {value === 'user' && <User className="w-3 h-3" />}
                  {value === 'assistant' && <Bot className="w-3 h-3" />}
                  <span>{getRoleFilterLabel(value)}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
              {SOURCE_FILTERS.map((value) => (
                <button
                  key={value}
                  onClick={() => onSourceFilterChange(value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    effectiveSourceFilter === value
                      ? 'bg-foreground/[0.06] text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {value === 'labels_only' && <Tag className="w-3 h-3" />}
                  {value === 'content_only' && (
                    <FileText className="w-3 h-3" />
                  )}
                  {value === 'all' && <Search className="w-3 h-3" />}
                  <span>{getSourceFilterLabel(t, value)}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
              {(['newest', 'oldest', 'score'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() =>
                    setFtsOptions({
                      ...ftsOptions,
                      sortMode: mode,
                      page: 0,
                    })
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    effectiveSortMode === mode
                      ? 'bg-foreground/[0.06] text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode === 'newest' && (
                    <ArrowUpDown className="w-3 h-3 rotate-180" />
                  )}
                  {mode === 'oldest' && <ArrowUpDown className="w-3 h-3" />}
                  {mode === 'score' && <Star className="w-3 h-3" />}
                  <span>{getSortLabel(mode)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

        {/*{mode === 'search' && <div className="ml-auto flex min-w-[190px] items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2">*/}
        {/*  <Globe className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />*/}
        {/*  <CompositionInput*/}
        {/*    type="text"*/}
        {/*    value={ftsOptions.globPattern || ''}*/}
        {/*    onChange={(value) =>*/}
        {/*      setFtsOptions({*/}
        {/*        ...ftsOptions,*/}
        {/*        globPattern: value || undefined,*/}
        {/*        page: 0,*/}
        {/*      })*/}
        {/*    }*/}
        {/*    placeholder="path..."*/}
        {/*    className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/55 outline-none"*/}
        {/*  />*/}
        {/*</div>}*/}
    </div>
  )
}
