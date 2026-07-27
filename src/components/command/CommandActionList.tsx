import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Command } from 'lucide-react'
import { psmPluginHost } from '@/plugins/runtime-host'
import type { CommandActionItem } from './commandActions'

interface CommandActionListProps {
  actions: CommandActionItem[]
  query: string
  selectedAction: CommandActionItem | null
  setSelectedAction: (action: CommandActionItem | null) => void
  error?: string | null
}

function usePluginNameMap(): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(() => buildPluginNameMap())
  useEffect(() => {
    setMap(buildPluginNameMap())
    return psmPluginHost.subscribe(() => setMap(buildPluginNameMap()))
  }, [])
  return map
}

function buildPluginNameMap(): Map<string, string> {
  const next = new Map<string, string>()
  for (const plugin of psmPluginHost.listPlugins()) {
    next.set(plugin.id, plugin.name)
  }
  return next
}

function monogramOf(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return '·'
  const tokens = trimmed.split(/[\s\-_/.]+/).filter(Boolean)
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[1][0]).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

export default function CommandActionList({
  actions,
  query,
  selectedAction,
  setSelectedAction,
  error,
}: CommandActionListProps) {
  const { t } = useTranslation()
  const pluginNames = usePluginNameMap()

  const groups = useMemo(() => {
    const buckets = new Map<string, { label: string; actions: CommandActionItem[] }>()
    for (const action of actions) {
      const key = action.pluginId
      const label = pluginNames.get(action.pluginId) ?? action.category ?? action.pluginId
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.actions.push(action)
      } else {
        buckets.set(key, { label, actions: [action] })
      }
    }
    return Array.from(buckets.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label))
  }, [actions, pluginNames])

  const hasQuery = query.trim().length > 0

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      {error && (
        <div className="mx-3 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {actions.length === 0 ? (
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center">
          <Command className="mb-2 h-5 w-5 text-muted-foreground/60" />
          <div className="text-[12px] text-muted-foreground">
            {hasQuery
              ? t('command.commands.emptyForQuery', 'No commands found')
              : t('command.commands.empty', 'No plugin commands registered')}
          </div>
        </div>
      ) : (
        <div className="py-1">
          {groups.map(([pluginId, group]) => (
            <section key={pluginId} className="mb-1 last:mb-0">
              <div className="sticky top-0 z-10 bg-background/95 px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                {group.label}
              </div>
              <ul className="px-1">
                {group.actions.map((action) => {
                  const isSelected = selectedAction?.id === action.id
                  return (
                    <li key={action.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAction(action)}
                        onMouseEnter={() => setSelectedAction(action)}
                        disabled={action.disabled}
                        title={action.disabledReason || action.command.id}
                        className={[
                          'group flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left motion-color',
                          'focus:outline-none focus-visible:bg-info/[0.06]',
                          action.disabled ? 'opacity-45' : '',
                          isSelected
                            ? 'bg-foreground/[0.05] text-foreground'
                            : 'text-foreground/95 hover:bg-foreground/[0.035]',
                        ].join(' ')}
                      >
                        <span
                          aria-hidden
                          className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-[5px] border border-border/60 bg-surface/45 text-[10px] font-semibold tracking-tight text-muted-foreground"
                        >
                          {monogramOf(group.label)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {action.title}
                        </span>
                        {action.description && (
                          <span className="hidden flex-shrink truncate text-[11px] text-muted-foreground sm:inline-block sm:max-w-[40%]">
                            {action.description}
                          </span>
                        )}
                        {action.shortcut && (
                          <kbd className="flex-shrink-0 rounded-[4px] border border-border/55 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {action.shortcut}
                          </kbd>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
