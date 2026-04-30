import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { KanbanWorkspace } from '@/hooks/useWorkspaces'
import type { SessionInfo, Tag } from '@/types'

interface WorkspaceEditorProps {
  workspace?: KanbanWorkspace | null
  sessions: SessionInfo[]
  tags: Tag[]
  onSave: (workspace: Omit<KanbanWorkspace, 'createdAt' | 'updatedAt'>) => void
  onClose: () => void
}

const ICONS = ['📋', '🎨', '💻', '🚀', '🔧', '📊', '🎯', '🌟', '📁', '🧪']
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export default function WorkspaceEditor({
  workspace,
  sessions,
  tags,
  onSave,
  onClose,
}: WorkspaceEditorProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(workspace?.name || '')
  const [icon, setIcon] = useState(workspace?.icon || ICONS[0])
  const [color, setColor] = useState(workspace?.color || COLORS[0])
  const [projectFilter, setProjectFilter] = useState<string | null>(workspace?.config.projectFilter || null)
  const [filterTagIds, setFilterTagIds] = useState<string[]>(workspace?.config.filterTagIds || [])

  const projects = Array.from(new Set(sessions.map(s => s.cwd).filter(Boolean)))

  const handleToggleTag = (tagId: string) => {
    setFilterTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSave = () => {
    if (!name.trim()) return

    onSave({
      id: workspace?.id || '__new__',
      name: name.trim(),
      icon,
      color,
      config: {
        projectFilter,
        filterTagIds,
        sourceFilterSlugs: workspace?.config.sourceFilterSlugs || [],
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg shadow-2xl border border-border w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">
            {workspace ? t('kanban.workspace.edit') : t('kanban.workspace.create')}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t('kanban.workspace.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder={t('kanban.workspace.namePlaceholder')}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t('kanban.workspace.icon')}
            </label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(i => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  className={`w-8 h-8 rounded-md flex items-center justify-center text-lg ${
                    icon === i ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t('kanban.workspace.color')}
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full ${
                    color === c ? 'ring-2 ring-offset-2 ring-primary' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t('kanban.workspace.projectFilter')}
            </label>
            <select
              value={projectFilter || ''}
              onChange={(e) => setProjectFilter(e.target.value || null)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            >
              <option value="">{t('kanban.workspace.allProjects')}</option>
              {projects.map(project => (
                <option key={project} value={project}>
                  {project?.split('/').pop()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t('kanban.workspace.tagFilters')}
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTag(tag.id)}
                  className={`px-2.5 py-1 rounded-md text-xs ${
                    filterTagIds.includes(tag.id)
                      ? 'bg-primary/10 text-primary ring-1 ring-primary'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted motion-color"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 motion-color"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
