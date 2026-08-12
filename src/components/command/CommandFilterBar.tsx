import { useTranslation } from 'react-i18next'
import {
  Search,
  User,
  Bot,
  ArrowUpDown,
  Star,
  Command,
  Wrench,
} from 'lucide-react'
import type { MessageSearchPluginOptions } from '@/plugins/message/MessageSearchPlugin'
import {
  TABS,
  getTabLabel,
  getRoleFilterLabel,
  getSortLabel,
} from './utils'
import type { CommandPaletteMode } from './commandActions'
import { getCachedSettings } from '@/utils/settingsApi'

interface CommandFilterBarProps {
  mode: CommandPaletteMode
  setMode: (mode: CommandPaletteMode) => void
  activeTab: 'all' | 'labels' | 'message' | 'session' | 'project'
  setActiveTab: (tab: 'all' | 'labels' | 'message' | 'session' | 'project') => void
  tabCounts: Record<'all' | 'labels' | 'message' | 'session' | 'project', number>
  supportsMessageFilters: boolean
  ftsOptions: MessageSearchPluginOptions
  setFtsOptions: (options: MessageSearchPluginOptions) => void
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
  effectiveSortMode,
}: CommandFilterBarProps) {
  const { t } = useTranslation()
  const showAdvancedMessageFilters = supportsMessageFilters
  const devModeEnabled = getCachedSettings().advanced.debugMode
  const modeOptions: CommandPaletteMode[] = devModeEnabled
    ? ['search', 'commands', 'dev']
    : ['search', 'commands']

  const segmentBase =
    'inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-[3px] text-[11px] transition-colors select-none'
  const segmentActive =
    'bg-background text-foreground shadow-[0_0_0_0.5px_rgb(var(--color-border)/0.9),0_1px_1.5px_rgb(0_0_0/0.06)]'
  const segmentInactive = 'text-muted-foreground hover:text-foreground'
  const segmentedGroup =
    'inline-flex items-center gap-[2px] rounded-md border border-border/70 bg-surface/35 p-[2px]'

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div className={segmentedGroup}>
        {modeOptions.map((value) => {
          const isActive = mode === value
          const Icon = value === 'search' ? Search : value === 'commands' ? Command : Wrench
          return (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`${segmentBase} ${isActive ? segmentActive : segmentInactive}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>
                {value === 'search'
                  ? t('command.mode.search', 'Search')
                  : value === 'commands'
                  ? t('command.mode.commands', 'Commands')
                  : t('command.mode.dev', 'Dev')}
              </span>
            </button>
          )
        })}
      </div>

      {mode === 'search' && (
        <div className={segmentedGroup}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${segmentBase} ${isActive ? segmentActive : segmentInactive}`}
              >
                <tab.Icon className="w-3.5 h-3.5" />
                <span>{getTabLabel(t, tab)}</span>
                {tabCounts[tab.id] > 0 && (
                  <span
                    className={`inline-flex min-w-[16px] items-center justify-center rounded-[3px] px-1 text-[10px] font-semibold tabular-nums ${
                      isActive
                        ? 'bg-foreground/85 text-background'
                        : 'bg-surface/60 text-muted-foreground'
                    }`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {mode === 'search' && showAdvancedMessageFilters && (
        <>
          <div className="h-5 w-px bg-border/70" />
          <div className="flex flex-wrap items-center gap-2">
            <div className={segmentedGroup}>
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
                  className={`${segmentBase} ${ftsOptions.roleFilter === value ? segmentActive : segmentInactive}`}
                >
                  {value === 'all' && (
                    <>
                      <User className="w-3 h-3" />
                      <Bot className="w-3 h-3" />
                    </>
                  )}
                  {value === 'user' && <User className="w-3 h-3" />}
                  {value === 'assistant' && <Bot className="w-3 h-3" />}
                  <span>{getRoleFilterLabel(t, value)}</span>
                </button>
              ))}
            </div>

            <div className={segmentedGroup}>
              {(['newest', 'oldest', 'score'] as const).map((sortValue) => (
                <button
                  key={sortValue}
                  onClick={() =>
                    setFtsOptions({
                      ...ftsOptions,
                      sortMode: sortValue,
                      page: 0,
                    })
                  }
                  className={`${segmentBase} ${effectiveSortMode === sortValue ? segmentActive : segmentInactive}`}
                >
                  {sortValue === 'newest' && (
                    <ArrowUpDown className="w-3 h-3 rotate-180" />
                  )}
                  {sortValue === 'oldest' && <ArrowUpDown className="w-3 h-3" />}
                  {sortValue === 'score' && <Star className="w-3 h-3" />}
                  <span>{getSortLabel(t, sortValue)}</span>
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
