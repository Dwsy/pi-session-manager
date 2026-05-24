import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { usePsmPluginUi } from '@/plugins/runtime-host'

interface ShortcutItem {
  keys: string
  labelKey: string
  fallback: string
  category: 'navigation' | 'session' | 'search' | 'general'
}

const shortcuts: ShortcutItem[] = [
  {
    keys: 'Cmd+Shift+F',
    labelKey: 'app.shortcuts.searchAll',
    fallback: 'Search all sessions',
    category: 'search',
  },
  {
    keys: 'Cmd+F',
    labelKey: 'app.shortcuts.search',
    fallback: 'Search current view',
    category: 'search',
  },
  {
    keys: 'Cmd+G',
    labelKey: 'search.nextAction',
    fallback: 'Next search result',
    category: 'search',
  },
  {
    keys: 'Shift+Cmd+G',
    labelKey: 'search.previousAction',
    fallback: 'Previous search result',
    category: 'search',
  },
  {
    keys: 'Cmd+L',
    labelKey: 'app.viewMode.list',
    fallback: 'List view',
    category: 'navigation',
  },
  {
    keys: 'Cmd+P',
    labelKey: 'app.shortcuts.projectView',
    fallback: 'Project view',
    category: 'navigation',
  },
  {
    keys: 'Cmd+R',
    labelKey: 'app.shortcuts.resume',
    fallback: 'Resume session',
    category: 'session',
  },
  {
    keys: 'Cmd+E',
    labelKey: 'app.shortcuts.exportHtml',
    fallback: 'Export and open',
    category: 'session',
  },
  {
    keys: 'Cmd+Backspace',
    labelKey: 'app.shortcuts.deleteSelected',
    fallback: 'Delete selected sessions',
    category: 'session',
  },
  {
    keys: 'Cmd+,',
    labelKey: 'app.shortcuts.settings',
    fallback: 'Open settings',
    category: 'general',
  },
  {
    keys: 'Esc',
    labelKey: 'app.shortcuts.close',
    fallback: 'Close',
    category: 'general',
  },
  {
    keys: 'F12',
    labelKey: 'settings.shortcuts.devtools',
    fallback: 'Developer tools',
    category: 'general',
  },
]

const categoryOrder: ShortcutItem['category'][] = ['search', 'navigation', 'session', 'general']

const categoryLabels: Record<ShortcutItem['category'], { key: string; fallback: string }> = {
  search: { key: 'settings.shortcuts.categories.search', fallback: 'Search' },
  navigation: {
    key: 'settings.shortcuts.categories.navigation',
    fallback: 'Navigation',
  },
  session: {
    key: 'settings.shortcuts.categories.session',
    fallback: 'Session',
  },
  general: {
    key: 'settings.shortcuts.categories.general',
    fallback: 'General',
  },
}

export default function ShortcutSettings() {
  const { t } = useTranslation()
  const { appViews } = usePsmPluginUi()
  const allShortcuts = useMemo(() => [
    ...shortcuts,
    ...appViews.flatMap((view): ShortcutItem[] => (
      view.shortcut
        ? [{
            keys: view.shortcut,
            labelKey: '',
            fallback: view.title,
            category: 'navigation',
          }]
        : []
    )),
  ], [appViews])

  const grouped = categoryOrder.map((cat) => ({
    category: cat,
    label: categoryLabels[cat],
    items: allShortcuts.filter((s) => s.category === cat),
  }))

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.shortcuts.description',
          'View all available keyboard shortcuts. Use Cmd on macOS and Ctrl on Windows/Linux.',
        )}
      </p>

      {grouped.map((group) => (
        <div key={group.category} className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t(group.label.key, group.label.fallback)}
          </h4>
          <div className="bg-surface rounded-lg divide-y divide-border">
            {group.items.map((item) => (
              <div
                key={item.keys}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 min-h-[44px]"
              >
                <span className="text-sm text-foreground min-w-0">
                  {item.labelKey ? t(item.labelKey, item.fallback) : item.fallback}
                </span>
                <kbd className="inline-flex items-center gap-1 px-2 py-1 bg-surface-dark border border-border-hover rounded text-xs font-mono text-foreground shadow-sm flex-shrink-0 w-fit">
                  {item.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
