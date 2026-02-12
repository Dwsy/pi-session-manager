import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, GripVertical, Zap, ChevronRight, ChevronDown } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTags } from '../../../hooks/useTags'
import { getColorClass, getColorStyle } from '../../TagBadge'
import type { AutoRule, Tag } from '../../../types'

const PRESET_COLORS = [
  { id: 'info', label: 'Blue' },
  { id: 'success', label: 'Green' },
  { id: 'warning', label: 'Orange' },
  { id: 'destructive', label: 'Red' },
  { id: 'purple', label: 'Purple' },
  { id: 'pink', label: 'Pink' },
  { id: 'indigo', label: 'Indigo' },
  { id: 'amber', label: 'Amber' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'cyan', label: 'Cyan' },
  { id: 'slate', label: 'Slate' },
]

function isValidRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true } catch { return false }
}

// Hover color picker — petals around the current color
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className={`block h-4 w-4 rounded-full cursor-pointer ${value.startsWith('#') ? '' : getColorClass(value)}`}
        style={getColorStyle(value)}
      />
      {open && (
        <div className="absolute left-1/2 top-1/2 z-50" style={{ width: 0, height: 0 }}>
          {PRESET_COLORS.map((c, i) => {
            const angle = (i / PRESET_COLORS.length) * 2 * Math.PI - Math.PI / 2
            const r = 22
            const x = Math.cos(angle) * r
            const y = Math.sin(angle) * r
            return (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false) }}
                className={`absolute h-3.5 w-3.5 rounded-full transition-all duration-150 hover:scale-150 ${getColorClass(c.id)} ${value === c.id ? 'ring-2 ring-info ring-offset-1 ring-offset-background' : ''}`}
                style={{ left: x - 7, top: y - 7 }}
                title={c.label}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface TagNodeProps {
  tag: Tag
  depth: number
  allTags: Tag[]
  editingId: string | null
  editName: string
  editColor: string
  rulesExpandedId: string | null
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onStartEdit: (tag: Tag) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onSetEditName: (v: string) => void
  onSetEditColor: (v: string) => void
  onDelete: (id: string) => void
  onToggleRules: (id: string) => void
  parseRules: (tag: Tag) => AutoRule[]
  saveRules: (tagId: string, rules: AutoRule[]) => void
  onCreateChild: (parentId: string) => void
  t: ReturnType<typeof import('react-i18next').useTranslation>['t']
}

function SortableTagNode(props: TagNodeProps) {
  const { tag, depth } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    marginLeft: depth > 0 ? `${depth * 16}px` : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} className="bg-background rounded-lg">
      <TagNodeContent {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

function TagNodeContent({
  tag, allTags, editingId, editName, editColor,
  rulesExpandedId, expandedIds, onToggleExpand, onStartEdit,
  onSaveEdit, onCancelEdit, onSetEditName, onSetEditColor,
  onDelete, onToggleRules, parseRules, saveRules, onCreateChild, t,
  dragHandleProps,
}: TagNodeProps & { dragHandleProps: Record<string, any> }) {
  const children = allTags.filter(c => c.parentId === tag.id).sort((a, b) => a.sortOrder - b.sortOrder)
  const hasChildren = children.length > 0
  const expanded = expandedIds.has(tag.id)
  const rules = parseRules(tag)
  const rulesExpanded = rulesExpandedId === tag.id

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 group">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0 cursor-grab active:cursor-grabbing" {...dragHandleProps} />
        {hasChildren ? (
          <button onClick={() => onToggleExpand(tag.id)} className="p-0.5 -ml-1 flex-shrink-0">
            {expanded
              ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        {editingId === tag.id ? (
          <>
            <input value={editName} onChange={e => onSetEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit() }} className="flex-1 px-2 py-1 bg-surface border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-info" autoFocus />
            <ColorPicker value={editColor} onChange={onSetEditColor} />
            <button onClick={onSaveEdit} className="text-xs text-info hover:underline">{t('common.save', 'Save')}</button>
            <button onClick={onCancelEdit} className="text-xs text-muted-foreground hover:underline">{t('common.cancel', 'Cancel')}</button>
          </>
        ) : (
          <>
            <ColorPicker value={tag.color} onChange={(c) => { onStartEdit(tag); onSetEditColor(c) }} />
            <span className="flex-1 text-sm text-foreground cursor-pointer hover:text-info" onClick={() => onStartEdit(tag)}>{tag.name}</span>
            <button onClick={() => onCreateChild(tag.id)} className="p-1 text-muted-foreground/40 hover:text-info opacity-0 group-hover:opacity-100 transition-all" title="Add child label">
              <Plus className="h-3 w-3" />
            </button>
            <button onClick={() => onToggleRules(tag.id)} className={`p-1 rounded transition-all ${rulesExpanded ? 'text-info' : 'text-muted-foreground/40 hover:text-muted-foreground'} ${rules.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} title={t('tags.autoRules.title')}>
              <Zap className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete(tag.id)} className="p-1 text-muted-foreground/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" title={t('tags.remove')}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      {rulesExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30 mx-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('tags.autoRules.title')}</span>
            <button onClick={() => saveRules(tag.id, [...rules, { pattern: '', enabled: true }])} className="text-[10px] text-info hover:underline">{t('tags.autoRules.add')}</button>
          </div>
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={rule.enabled} onChange={e => { const next = [...rules]; next[i] = { ...rule, enabled: e.target.checked }; saveRules(tag.id, next) }} className="h-3.5 w-3.5 rounded" />
              <input value={rule.pattern} onChange={e => { const next = [...rules]; next[i] = { ...rule, pattern: e.target.value }; saveRules(tag.id, next) }} placeholder={t('tags.autoRules.pattern')} className={`flex-1 px-2 py-1 bg-surface border rounded text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-info ${rule.pattern && !isValidRegex(rule.pattern) ? 'border-red-500' : 'border-border'}`} />
              <input value={rule.description || ''} onChange={e => { const next = [...rules]; next[i] = { ...rule, description: e.target.value }; saveRules(tag.id, next) }} placeholder={t('tags.autoRules.description')} className="w-28 px-2 py-1 bg-surface border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-info" />
              <button onClick={() => saveRules(tag.id, rules.filter((_, j) => j !== i))} className="p-0.5 text-muted-foreground/40 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          {rules.some(r => r.pattern && !isValidRegex(r.pattern)) && (
            <p className="text-[10px] text-red-500">{t('tags.autoRules.invalid')}</p>
          )}
        </div>
      )}
      {hasChildren && expanded && children.map(child => (
        <SortableTagNode
          key={child.id}
          tag={child}
          depth={1}
          allTags={allTags}
          editingId={editingId}
          editName={editName}
          editColor={editColor}
          rulesExpandedId={rulesExpandedId}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onStartEdit={onStartEdit}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onSetEditName={onSetEditName}
          onSetEditColor={onSetEditColor}
          onDelete={onDelete}
          onToggleRules={onToggleRules}
          parseRules={parseRules}
          saveRules={saveRules}
          onCreateChild={onCreateChild}
          t={t}
        />
      ))}
    </>
  )
}

export default function TagManagerSettings() {
  const { t } = useTranslation()
  const { tags, createTag, updateTag, deleteTag, updateTagAutoRules, reorderTags } = useTags()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('info')
  const [newParentId, setNewParentId] = useState<string | undefined>(undefined)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [rulesExpandedId, setRulesExpandedId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const rootTags = useMemo(() => tags.filter(t => !t.parentId).sort((a, b) => a.sortOrder - b.sortOrder), [tags])
  const statusTags = useMemo(() => rootTags.filter(t => t.isBuiltin), [rootTags])
  const labelTags = useMemo(() => rootTags.filter(t => !t.isBuiltin), [rootTags])
  const labelTagIds = useMemo(() => labelTags.map(t => t.id), [labelTags])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = labelTags.findIndex(t => t.id === active.id)
    const newIdx = labelTags.findIndex(t => t.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = [...labelTags]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)
    const allIds = [...statusTags.map(t => t.id), ...reordered.map(t => t.id)]
    reorderTags(allIds)
  }, [labelTags, statusTags, reorderTags])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await createTag(name, newColor, undefined, newParentId)
    setNewName('')
    setNewColor('info')
    setNewParentId(undefined)
  }

  const startEdit = (tag: Tag) => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color) }
  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return
    await updateTag(editingId, { name: editName.trim(), color: editColor })
    setEditingId(null)
  }
  const handleDelete = async (id: string) => { if (!confirm(t('tags.confirmDelete'))) return; await deleteTag(id) }
  const parseRules = (tag: Tag): AutoRule[] => { try { return tag.autoRules ? JSON.parse(tag.autoRules) : [] } catch { return [] } }
  const saveRules = async (tagId: string, rules: AutoRule[]) => { await updateTagAutoRules(tagId, rules.length > 0 ? JSON.stringify(rules) : null) }
  const onToggleExpand = (id: string) => { setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next }) }
  const onCreateChild = (parentId: string) => { setNewParentId(parentId); setExpandedIds(prev => new Set([...prev, parentId])) }

  const parentTag = newParentId ? tags.find(t => t.id === newParentId) : null

  const nodeProps = {
    allTags: tags, editingId, editName, editColor,
    rulesExpandedId, expandedIds, onToggleExpand,
    onStartEdit: startEdit, onSaveEdit: saveEdit,
    onCancelEdit: () => setEditingId(null),
    onSetEditName: setEditName, onSetEditColor: setEditColor,
    onDelete: handleDelete,
    onToggleRules: (id: string) => setRulesExpandedId(rulesExpandedId === id ? null : id),
    parseRules, saveRules, onCreateChild, t,
  }

  return (
    <div className="space-y-6">
      {/* Statuses — builtin, read-only */}
      <div>
        <label className="text-sm font-medium text-foreground">{t('tags.filter.statuses')}</label>
        <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">{t('tags.statusesHint')}</p>
        <div className="space-y-1">
          {statusTags.map(tag => (
            <div key={tag.id} className="flex items-center gap-2 px-3 py-2 bg-background rounded-lg">
              <span className={`h-3 w-3 rounded-full flex-shrink-0 ${tag.color.startsWith('#') ? '' : getColorClass(tag.color)}`} style={getColorStyle(tag.color)} />
              <span className="flex-1 text-sm text-foreground">{tag.name}</span>
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{t('tags.builtin')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Labels — user-created, draggable */}
      <div>
        <label className="text-sm font-medium text-foreground">{t('tags.filter.labels')}</label>
        <p className="text-[11px] text-muted-foreground mt-0.5">{t('tags.labelsHint')}</p>

        {parentTag && (
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[10px] text-muted-foreground">Parent:</span>
            <span className={`h-2 w-2 rounded-full ${parentTag.color.startsWith('#') ? '' : getColorClass(parentTag.color)}`} style={getColorStyle(parentTag.color)} />
            <span className="text-[11px] text-foreground">{parentTag.name}</span>
            <button onClick={() => setNewParentId(undefined)} className="text-[10px] text-muted-foreground hover:text-foreground ml-1">&times;</button>
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder={t('tags.namePlaceholder')} className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-info" />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <button onClick={handleCreate} disabled={!newName.trim()} className="flex items-center gap-1.5 px-3 py-2 bg-info hover:bg-info/80 text-white text-sm rounded-lg transition-colors disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" />{t('tags.add')}
          </button>
        </div>

        {labelTags.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-3">{t('tags.empty')}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={labelTagIds} strategy={verticalListSortingStrategy}>
              <div className="mt-3 space-y-1">
                {labelTags.map(tag => (
                  <SortableTagNode key={tag.id} tag={tag} depth={0} {...nodeProps} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
