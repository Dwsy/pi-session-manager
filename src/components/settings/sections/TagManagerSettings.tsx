import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, GripVertical, Zap } from 'lucide-react'
import { useTags } from '../../../hooks/useTags'
import { getColorClass, getColorStyle } from '../../TagBadge'
import type { AutoRule } from '../../../types'

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

export default function TagManagerSettings() {
  const { t } = useTranslation()
  const { tags, createTag, updateTag, deleteTag, updateTagAutoRules } = useTags()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('info')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [rulesExpandedId, setRulesExpandedId] = useState<string | null>(null)

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await createTag(name, newColor)
    setNewName('')
    setNewColor('info')
  }

  // PLACEHOLDER_REST

  const startEdit = (tag: { id: string; name: string; color: string }) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return
    await updateTag(editingId, { name: editName.trim(), color: editColor })
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('tags.confirmDelete'))) return
    await deleteTag(id)
  }

  const parseRules = (tag: { autoRules?: string }): AutoRule[] => {
    try { return tag.autoRules ? JSON.parse(tag.autoRules) : [] } catch { return [] }
  }

  const saveRules = async (tagId: string, rules: AutoRule[]) => {
    await updateTagAutoRules(tagId, rules.length > 0 ? JSON.stringify(rules) : null)
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-foreground">{t('tags.createNew')}</label>
        <div className="flex items-center gap-2 mt-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder={t('tags.namePlaceholder')} className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-info" />
          <div className="flex items-center gap-1">
            {PRESET_COLORS.slice(0, 6).map(c => (
              <button key={c.id} onClick={() => setNewColor(c.id)} className={`h-5 w-5 rounded-full transition-all ${getColorClass(c.id)} ${newColor === c.id ? 'ring-2 ring-offset-1 ring-offset-background ring-info scale-110' : 'opacity-60 hover:opacity-100'}`} title={c.label} />
            ))}
          </div>
          <button onClick={handleCreate} disabled={!newName.trim()} className="flex items-center gap-1.5 px-3 py-2 bg-info hover:bg-info/80 text-white text-sm rounded-lg transition-colors disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" />{t('tags.add')}
          </button>
        </div>
      </div>

      {/* Tag list with auto-rules */}
      <div>
        <label className="text-sm font-medium text-foreground">{t('tags.existing')}</label>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-2">{t('tags.empty')}</p>
        ) : (
          <div className="mt-2 space-y-1">
            {tags.map(tag => {
              const rules = parseRules(tag)
              const expanded = rulesExpandedId === tag.id
              return (
                <div key={tag.id} className="bg-background rounded-lg">
                  <div className="flex items-center gap-2 px-3 py-2 group">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                    {editingId === tag.id ? (
                      <>
                        <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }} className="flex-1 px-2 py-1 bg-surface border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-info" autoFocus />
                        <div className="flex items-center gap-0.5">
                          {PRESET_COLORS.map(c => (<button key={c.id} onClick={() => setEditColor(c.id)} className={`h-4 w-4 rounded-full ${getColorClass(c.id)} ${editColor === c.id ? 'ring-2 ring-info ring-offset-1 ring-offset-background' : 'opacity-50 hover:opacity-100'}`} />))}
                        </div>
                        <button onClick={saveEdit} className="text-xs text-info hover:underline">{t('common.save', 'Save')}</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:underline">{t('common.cancel', 'Cancel')}</button>
                      </>
                    ) : (
                      <>
                        <span className={`h-3 w-3 rounded-full flex-shrink-0 ${tag.color.startsWith('#') ? '' : getColorClass(tag.color)}`} style={getColorStyle(tag.color)} />
                        <span className="flex-1 text-sm text-foreground cursor-pointer hover:text-info" onClick={() => startEdit(tag)}>{tag.name}</span>
                        <button onClick={() => setRulesExpandedId(expanded ? null : tag.id)} className={`p-1 rounded transition-all ${expanded ? 'text-info' : 'text-muted-foreground/40 hover:text-muted-foreground'} ${rules.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} title={t('tags.autoRules.title')}>
                          <Zap className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(tag.id)} className="p-1 text-muted-foreground/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" title={t('tags.remove')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {expanded && (
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
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
