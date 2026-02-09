import { useTranslation } from 'react-i18next'

interface ShortcutItem {
  keys: string
  labelKey: string
  fallback: string
  category: 'navigation' | 'session' | 'search' | 'general'
}

const shortcuts: ShortcutItem[] = [
  { keys: 'Cmd+K', labelKey: 'app.shortcuts.searchAll', fallback: '搜索所有会话', category: 'search' },
  { keys: 'Cmd+F', labelKey: 'app.shortcuts.search', fallback: '聚焦搜索框', category: 'search' },
  { keys: 'Cmd+P', labelKey: 'app.shortcuts.projectView', fallback: '项目视图', category: 'navigation' },
  { keys: 'Cmd+R', labelKey: 'app.shortcuts.resume', fallback: '恢复会话', category: 'session' },
  { keys: 'Cmd+E', labelKey: 'app.shortcuts.exportHtml', fallback: '导出并打开', category: 'session' },
  { keys: 'Cmd+,', labelKey: 'app.shortcuts.settings', fallback: '打开设置', category: 'general' },
  { keys: 'Esc', labelKey: 'app.shortcuts.close', fallback: '关闭', category: 'general' },
  { keys: 'F12', labelKey: 'settings.shortcuts.devtools', fallback: '开发者工具', category: 'general' },
]

const categoryOrder: ShortcutItem['category'][] = ['search', 'navigation', 'session', 'general']

const categoryLabels: Record<ShortcutItem['category'], { key: string; fallback: string }> = {
  search: { key: 'settings.shortcuts.categories.search', fallback: 'Search' },
  navigation: { key: 'settings.shortcuts.categories.navigation', fallback: 'Navigation' },
  session: { key: 'settings.shortcuts.categories.session', fallback: 'Session' },
  general: { key: 'settings.shortcuts.categories.general', fallback: 'General' },
}

export default function ShortcutSettings() {
  const { t } = useTranslation()

  const grouped = categoryOrder.map(cat => ({
    category: cat,
    label: categoryLabels[cat],
    items: shortcuts.filter(s => s.category === cat),
  }))

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#6a6f85]">
        {t('settings.shortcuts.description', '查看所有可用的键盘快捷键。在 macOS 上使用 Cmd，在 Windows/Linux 上使用 Ctrl。')}
      </p>

      {grouped.map(group => (
        <div key={group.category} className="space-y-2">
          <h4 className="text-xs font-semibold text-[#8a8fa0] uppercase tracking-wider">
            {t(group.label.key, group.label.fallback)}
          </h4>
          <div className="bg-[#252636] rounded-lg divide-y divide-[#2c2d3b]">
            {group.items.map(item => (
              <div
                key={item.keys}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-[#d4d4d8]">
                  {t(item.labelKey, item.fallback)}
                </span>
                <kbd className="inline-flex items-center gap-1 px-2 py-1 bg-[#1e1f2e] border border-[#3a3b4f] rounded text-xs font-mono text-white shadow-sm">
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
