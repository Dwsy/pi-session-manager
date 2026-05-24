import { useTranslation } from 'react-i18next'
import { Command, Zap } from 'lucide-react'
import type { CommandActionItem } from './commandActions'

interface CommandActionListProps {
  actions: CommandActionItem[]
  query: string
  selectedAction: CommandActionItem | null
  setSelectedAction: (action: CommandActionItem | null) => void
  error?: string | null
}

export default function CommandActionList({
  actions,
  query,
  selectedAction,
  setSelectedAction,
  error,
}: CommandActionListProps) {
  const { t } = useTranslation()
  const groupedActions = actions.reduce<Record<string, CommandActionItem[]>>((acc, action) => {
    if (!acc[action.category]) acc[action.category] = []
    acc[action.category].push(action)
    return acc
  }, {})

  const hasQuery = query.trim().length > 0

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
      {error && (
        <div className="mb-3 rounded-2xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {actions.length === 0 && (
        <div className="flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-surface/50">
            <Command className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium text-foreground">
            {hasQuery
              ? t('command.commands.emptyForQuery', 'No commands found')
              : t('command.commands.empty', 'No plugin commands registered')}
          </div>
          <div className="mt-2 max-w-[260px] text-xs leading-5 text-muted-foreground">
            {t('command.commands.emptyHint', 'Plugins can contribute actions with ctx.registerCommand(...).')}
          </div>
        </div>
      )}

      {Object.entries(groupedActions).map(([category, categoryActions]) => (
        <section key={category} className="mb-3 last:mb-0">
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            {category}
          </div>
          <div className="space-y-1">
            {categoryActions.map((action) => {
              const isSelected = selectedAction?.id === action.id
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => setSelectedAction(action)}
                  onMouseEnter={() => setSelectedAction(action)}
                  onDoubleClick={() => !action.disabled && setSelectedAction(action)}
                  disabled={action.disabled}
                  className={[
                    'group relative w-full rounded-xl border text-left motion-context',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-info/30',
                    action.disabled ? 'cursor-not-allowed opacity-45' : '',
                    isSelected
                      ? 'border-info/20 bg-info/[0.03] shadow-sm'
                      : 'border-transparent bg-transparent hover:border-border/70 hover:bg-background/78',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface/50 text-muted-foreground">
                      <Zap className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {action.title}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate font-mono max-w-[180px]">
                        {action.command.id}
                      </span>
                      {action.shortcut && (
                        <kbd className="rounded-md border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px]">
                          {action.shortcut}
                        </kbd>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
