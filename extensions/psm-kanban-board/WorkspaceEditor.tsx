import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, FolderInput, Tag, X } from 'lucide-react'

import TagBadge from '@/components/tags/TagBadge'
import type { SessionInfo, Tag as TagType } from '@/types'

import type { KanbanWorkspace, KanbanWorkspaceDraft } from './workspaceStore'

interface WorkspaceEditorProps {
  workspace?: KanbanWorkspace | null
  sessions: SessionInfo[]
  tags: TagType[]
  sourceOptions?: Array<{ slug: string; label: string }>
  onSave: (workspace: KanbanWorkspaceDraft) => void | Promise<void>
  onClose: () => void
}

export default function WorkspaceEditor({
  workspace,
  sessions,
  tags,
  sourceOptions = [],
  onSave,
  onClose,
}: WorkspaceEditorProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(workspace?.name || '')
  const [projectFilter, setProjectFilter] = useState<string | null>(workspace?.config.projectFilter || null)
  const [filterTagIds, setFilterTagIds] = useState<string[]>(workspace?.config.filterTagIds || [])
  const [sourceFilterSlugs, setSourceFilterSlugs] = useState<string[]>(workspace?.config.sourceFilterSlugs || [])

  const projects = Array.from(new Set(sessions.map((session) => session.cwd).filter(Boolean))).sort()

  const handleToggleTag = (tagId: string) => {
    setFilterTagIds((prev) => (
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    ))
  }

  const handleToggleSource = (slug: string) => {
    setSourceFilterSlugs((prev) => (
      prev.includes(slug)
        ? prev.filter((item) => item !== slug)
        : [...prev, slug]
    ))
  }

  const handleSave = () => {
    if (!name.trim()) return

    void onSave({
      id: workspace?.id || '__new__',
      name: name.trim(),
      config: {
        projectFilter,
        filterTagIds,
        sourceFilterSlugs,
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-2xl border border-border w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-medium text-foreground">
            {workspace ? t('plugins.kanbanBoard.workspace.edit') : t('plugins.kanbanBoard.workspace.create')}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {t('plugins.kanbanBoard.workspace.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:ring-1 focus:ring-ring focus:border-primary outline-none"
              placeholder={t('plugins.kanbanBoard.workspace.namePlaceholder')}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <FolderInput className="h-3 w-3" />
              {t('plugins.kanbanBoard.workspace.projectFilter')}
            </label>
            <select
              value={projectFilter || ''}
              onChange={(event) => setProjectFilter(event.target.value || null)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:ring-1 focus:ring-ring outline-none"
            >
              <option value="">{t('plugins.kanbanBoard.workspace.allProjects')}</option>
              {projects.map((project) => (
                <option key={project} value={project}>
                  {project?.split('/').pop()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Tag className="h-3 w-3" />
              {t('plugins.kanbanBoard.workspace.tagFilters')}
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTag(tag.id)}
                  className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 ${
                    filterTagIds.includes(tag.id)
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/50'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  }`}
                >
                  <TagBadge tag={tag} compact />
                  <span>{tag.name}</span>
                </button>
              ))}
            </div>
          </div>

          {sourceOptions.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Database className="h-3 w-3" />
                {t('plugins.kanbanBoard.workspace.sourceFilters')}
              </label>
              <div className="flex flex-wrap gap-2">
                {sourceOptions.map((source) => (
                  <button
                    key={source.slug}
                    onClick={() => handleToggleSource(source.slug)}
                    className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 ${
                      sourceFilterSlugs.includes(source.slug)
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/50'
                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    }`}
                  >
                    <span>{source.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border/40 bg-muted/30">
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
