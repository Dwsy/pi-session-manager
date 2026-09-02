import { useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import type { KanbanLabel } from './kanbanLabelsStore'
import KanbanLabelBadge from './KanbanLabelBadge'

interface KanbanLabelManagerProps {
  labels: KanbanLabel[]
  onCreate: (input: Pick<KanbanLabel, 'name' | 'color' | 'description'>) => void | Promise<void>
  onUpdate: (id: string, updates: Partial<Pick<KanbanLabel, 'name' | 'color' | 'description'>>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onClose: () => void
}

const DEFAULT_COLOR = '#0969da'

export default function KanbanLabelManager({ labels, onCreate, onUpdate, onDelete, onClose }: KanbanLabelManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [description, setDescription] = useState('')

  const reset = () => {
    setEditingId(null)
    setName('')
    setColor(DEFAULT_COLOR)
    setDescription('')
  }

  const startEdit = (label: KanbanLabel) => {
    setEditingId(label.id)
    setName(label.name)
    setColor(label.color)
    setDescription(label.description)
  }

  const save = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const input = { name: trimmedName, color, description: description.trim() }
    if (editingId) await onUpdate(editingId, input)
    else await onCreate(input)
    reset()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Manage labels">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Labels</h3>
            <p className="text-[10px] text-muted-foreground">GitHub-style metadata, independent from workflow status.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-ring" aria-label="Close label manager">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-h-0 overflow-y-auto border-r border-border/30 p-3">
            {labels.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/50 px-3 py-8 text-center text-xs text-muted-foreground">No labels yet.</div>
            ) : (
              <div className="space-y-1.5">
                {labels.map((label) => (
                  <div key={label.id} className="group flex items-start gap-2 rounded-md border border-border/30 px-2.5 py-2 hover:bg-secondary/30">
                    <div className="min-w-0 flex-1">
                      <KanbanLabelBadge label={label} />
                      {label.description ? <p className="mt-1 truncate text-[10px] text-muted-foreground">{label.description}</p> : null}
                    </div>
                    <button type="button" onClick={() => startEdit(label)} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-ring" aria-label={`Edit label ${label.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => void onDelete(label.id)} className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 focus-ring" aria-label={`Delete label ${label.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 p-3">
            <div className="text-[11px] font-medium text-foreground">{editingId ? 'Edit label' : 'New label'}</div>
            <label className="block text-[10px] text-muted-foreground">
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/50" placeholder="bug" autoFocus />
            </label>
            <label className="block text-[10px] text-muted-foreground">
              Color
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-background p-1" aria-label="Label color" />
                <input value={color} onChange={(event) => setColor(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-[10px] text-foreground outline-none focus:border-primary/50" />
              </div>
            </label>
            <label className="block text-[10px] text-muted-foreground">
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-20 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50" placeholder="Optional label description" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              {editingId ? <button type="button" onClick={reset} className="rounded-md px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-muted">Cancel</button> : null}
              <button type="button" onClick={() => void save()} disabled={!name.trim()} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[10px] text-primary-foreground disabled:opacity-50">
                {editingId ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
