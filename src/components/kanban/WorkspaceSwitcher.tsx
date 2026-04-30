import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Settings, Trash2, ChevronDown } from 'lucide-react'
import type { KanbanWorkspace } from '@/hooks/useWorkspaces'

interface WorkspaceSwitcherProps {
  workspaces: KanbanWorkspace[]
  activeWorkspaceId: string
  onSelect: (id: string) => void
  onCreate: () => void
  onEdit: (workspace: KanbanWorkspace) => void
  onDelete: (id: string) => void
}

export default function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
}: WorkspaceSwitcherProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted motion-color focus-ring"
      >
        <span className="text-sm">{activeWorkspace?.icon || '📋'}</span>
        <span className="flex-1 text-left text-sm font-medium truncate">
          {activeWorkspace?.name || t('kanban.workspace.default')}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 max-h-[300px] overflow-y-auto">
          {workspaces.map(workspace => (
            <div
              key={workspace.id}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted motion-color group"
            >
              <button
                onClick={() => {
                  onSelect(workspace.id)
                  setIsOpen(false)
                }}
                className="flex-1 flex items-center gap-2 text-left"
              >
                <span className="text-sm">{workspace.icon || '📋'}</span>
                <span className="text-sm truncate">{workspace.name}</span>
              </button>

              {workspace.id !== '__default__' && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(workspace)
                      setIsOpen(false)
                    }}
                    className="p-1 rounded hover:bg-accent/10 text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(workspace.id)
                    }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="border-t border-border/50 mt-1 pt-1">
            <button
              onClick={() => {
                onCreate()
                setIsOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted motion-color"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('kanban.workspace.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
