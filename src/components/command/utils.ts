import { useTranslation } from 'react-i18next'
import type { FullTextSearchSourceFilter } from '@/types'
import { Search, MessageSquare, FileText, FolderOpen, Tag } from 'lucide-react'

export type TabType = 'all' | 'labels' | 'message' | 'session' | 'project'

export const TABS: {
  id: TabType
  key: string
  pluginId?: string
  Icon: typeof Search
}[] = [
  { id: 'all', key: 'tabs.all', Icon: Search },
  {
    id: 'labels',
    key: 'tabs.labels',
    pluginId: 'message-search',
    Icon: Tag,
  },
  {
    id: 'message',
    key: 'tabs.message',
    pluginId: 'message-search',
    Icon: MessageSquare,
  },
  {
    id: 'session',
    key: 'tabs.session',
    pluginId: 'session-search',
    Icon: FileText,
  },
  {
    id: 'project',
    key: 'tabs.project',
    pluginId: 'project-search',
    Icon: FolderOpen,
  },
]

export function getTabLabel(t: ReturnType<typeof useTranslation>['t'], tab: { key: string }) {
  return t(`command.${tab.key}`)
}

export function getRoleFilterLabel(value: 'all' | 'user' | 'assistant') {
  if (value === 'all') return 'All'
  if (value === 'user') return 'User'
  return 'AI'
}

export function getSourceFilterLabel(
  t: ReturnType<typeof useTranslation>['t'],
  value: FullTextSearchSourceFilter,
) {
  if (value === 'labels_only')
    return t('search.fullText.source.labels', 'Labels')
  if (value === 'content_only')
    return t('search.fullText.source.content', 'Content')
  return t('search.fullText.source.all', 'All')
}

export function getSortLabel(value: 'newest' | 'oldest' | 'score') {
  if (value === 'newest') return 'Newest'
  if (value === 'oldest') return 'Oldest'
  return 'Score'
}
