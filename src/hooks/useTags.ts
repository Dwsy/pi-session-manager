import { useState, useCallback, useEffect } from 'react'
import { invoke } from '../transport'
import type { Tag, SessionTag } from '../types'

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [sessionTags, setSessionTags] = useState<SessionTag[]>([])
  const [loading, setLoading] = useState(true)

  const loadTags = useCallback(async () => {
    try {
      const [allTags, allST] = await Promise.all([
        invoke<Tag[]>('get_all_tags'),
        invoke<SessionTag[]>('get_all_session_tags'),
      ])
      setTags(allTags)
      setSessionTags(allST)
    } catch (err) {
      console.error('Failed to load tags:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTags() }, [loadTags])

  const createTag = useCallback(async (name: string, color: string, icon?: string, parentId?: string) => {
    const tag = await invoke<Tag>('create_tag', { name, color, icon, parentId })
    setTags(prev => [...prev, tag])
    return tag
  }, [])

  const updateTag = useCallback(async (id: string, updates: Partial<Pick<Tag, 'name' | 'color' | 'icon'>>) => {
    await invoke('update_tag', { id, ...updates })
    setTags(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }, [])

  const deleteTag = useCallback(async (id: string) => {
    await invoke('delete_tag', { id })
    setTags(prev => prev.filter(t => t.id !== id))
    setSessionTags(prev => prev.filter(st => st.tagId !== id))
  }, [])

  const assignTag = useCallback(async (sessionId: string, tagId: string) => {
    await invoke('assign_tag', { sessionId, tagId })
    setSessionTags(prev => [
      ...prev.filter(st => !(st.sessionId === sessionId && st.tagId === tagId)),
      { sessionId, tagId, position: 0, assignedAt: new Date().toISOString() },
    ])
  }, [])

  const removeTagFromSession = useCallback(async (sessionId: string, tagId: string) => {
    await invoke('remove_tag_from_session', { sessionId, tagId })
    setSessionTags(prev => prev.filter(st => !(st.sessionId === sessionId && st.tagId === tagId)))
  }, [])

  const moveSession = useCallback(async (
    sessionId: string,
    fromTagId: string | null,
    toTagId: string,
    position: number,
  ) => {
    setSessionTags(prev => {
      const next = fromTagId
        ? prev.filter(st => !(st.sessionId === sessionId && st.tagId === fromTagId))
        : [...prev]
      return [
        ...next.filter(st => !(st.sessionId === sessionId && st.tagId === toTagId)),
        { sessionId, tagId: toTagId, position, assignedAt: new Date().toISOString() },
      ]
    })
    try {
      await invoke('move_session_tag', { sessionId, fromTagId, toTagId, position })
    } catch {
      await loadTags()
    }
  }, [loadTags])

  const reorderTags = useCallback(async (tagIds: string[]) => {
    setTags(prev => {
      const map = new Map(prev.map(t => [t.id, t]))
      return tagIds.filter(id => map.has(id)).map((id, i) => ({ ...map.get(id)!, sortOrder: i }))
    })
    await invoke('reorder_tags', { tagIds })
  }, [])

  const getTagsForSession = useCallback((sessionId: string): Tag[] => {
    const ids = new Set(sessionTags.filter(st => st.sessionId === sessionId).map(st => st.tagId))
    return tags.filter(t => ids.has(t.id))
  }, [tags, sessionTags])

  const getSessionsForTag = useCallback((tagId: string): SessionTag[] => {
    return sessionTags.filter(st => st.tagId === tagId).sort((a, b) => a.position - b.position)
  }, [sessionTags])

  const updateTagAutoRules = useCallback(async (id: string, rules: string | null) => {
    await invoke('update_tag_auto_rules', { id, autoRules: rules })
    setTags(prev => prev.map(t => t.id === id ? { ...t, autoRules: rules ?? undefined } : t))
  }, [])

  const evaluateAutoRules = useCallback(async (sessionId: string, text: string) => {
    const matched = await invoke<string[]>('evaluate_auto_rules', { sessionId, text })
    if (matched.length > 0) await loadTags()
    return matched
  }, [loadTags])

  const getDescendantIds = useCallback((tagId: string): string[] => {
    const result: string[] = []
    const children = tags.filter(t => t.parentId === tagId)
    for (const child of children) {
      result.push(child.id)
      result.push(...getDescendantIds(child.id))
    }
    return result
  }, [tags])

  const getRootTags = useCallback((): Tag[] => {
    return tags.filter(t => !t.parentId).sort((a, b) => a.sortOrder - b.sortOrder)
  }, [tags])

  const getChildTags = useCallback((parentId: string): Tag[] => {
    return tags.filter(t => t.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder)
  }, [tags])

  return {
    tags, sessionTags, loading,
    loadTags, createTag, updateTag, deleteTag,
    assignTag, removeTagFromSession, moveSession, reorderTags,
    getTagsForSession, getSessionsForTag,
    updateTagAutoRules, evaluateAutoRules,
    getDescendantIds, getRootTags, getChildTags,
  }
}
