import { Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@/types'

interface KanbanBulkToolbarProps {
  selectedCount: number
  tags: Tag[]
  onMoveToTag: (tagId: string) => void
  onDeleteSelected: () => void
  onClearSelection: () => void
}

export default function KanbanBulkToolbar({
  selectedCount,
  tags,
  onMoveToTag,
  onDeleteSelected,
  onClearSelection,
}: KanbanBulkToolbarProps) {
  const { t } = useTranslation()

  if (selectedCount <= 0) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-surface-dark/70 px-2 py-1 text-[11px] shadow-sm backdrop-blur-xl">
      <span className="text-muted-foreground tabular-nums">
        {t('plugins.kanbanBoard.bulk.selected', '{{count}} selected', { count: selectedCount })}
      </span>
      <select
        aria-label={t('plugins.kanbanBoard.bulk.moveSelected', 'Move selected')}
        className="h-7 max-w-[160px] rounded-md border border-border/35 bg-background/70 px-2 text-[11px] text-foreground outline-none focus:border-primary/60"
        defaultValue=""
        onChange={(event) => {
          const tagId = event.currentTarget.value
          if (!tagId) return
          onMoveToTag(tagId)
          event.currentTarget.value = ''
        }}
      >
        <option value="">{t('plugins.kanbanBoard.bulk.moveTo', 'Move to...')}</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>{tag.name}</option>
        ))}
      </select>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-ring"
        title={t('plugins.kanbanBoard.bulk.deleteSelected', 'Delete selected')}
        aria-label={t('plugins.kanbanBoard.bulk.deleteSelected', 'Delete selected')}
        onClick={onDeleteSelected}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-ring"
        title={t('plugins.kanbanBoard.bulk.clearSelection', 'Clear selection')}
        aria-label={t('plugins.kanbanBoard.bulk.clearSelection', 'Clear selection')}
        onClick={onClearSelection}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
