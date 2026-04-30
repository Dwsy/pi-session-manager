import { useState, useEffect, useCallback } from 'react'
import { invoke, isTauri } from '@/transport'

export interface KanbanWorkspace {
  id: string
  name: string
  icon?: string
  color?: string
  config: {
    projectFilter: string | null
    filterTagIds: string[]
    sourceFilterSlugs: string[]
  }
  createdAt: string
  updatedAt: string
}

const DEFAULT_WORKSPACE: KanbanWorkspace = {
  id: '__default__',
  name: 'All Projects',
  icon: '🌐',
  config: {
    projectFilter: null,
    filterTagIds: [],
    sourceFilterSlugs: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<KanbanWorkspace[]>([DEFAULT_WORKSPACE])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(DEFAULT_WORKSPACE.id)
  const [loading, setLoading] = useState(false)

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || DEFAULT_WORKSPACE

  const loadWorkspaces = useCallback(async () => {
    if (!isTauri()) return

    setLoading(true)
    try {
      const result = await invoke<KanbanWorkspace[]>('get_workspaces')
      setWorkspaces([DEFAULT_WORKSPACE, ...result])
    } catch (error) {
      console.error('Failed to load workspaces:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveWorkspace = useCallback(async (workspace: Omit<KanbanWorkspace, 'createdAt' | 'updatedAt'>) => {
    if (!isTauri()) return

    const now = new Date().toISOString()
    const fullWorkspace: KanbanWorkspace = {
      ...workspace,
      createdAt: now,
      updatedAt: now,
    }

    try {
      await invoke('save_workspace', { workspace: fullWorkspace })
      await loadWorkspaces()
    } catch (error) {
      console.error('Failed to save workspace:', error)
    }
  }, [loadWorkspaces])

  const deleteWorkspace = useCallback(async (id: string) => {
    if (!isTauri() || id === DEFAULT_WORKSPACE.id) return

    try {
      await invoke('delete_workspace', { id })
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(DEFAULT_WORKSPACE.id)
      }
      await loadWorkspaces()
    } catch (error) {
      console.error('Failed to delete workspace:', error)
    }
  }, [activeWorkspaceId, loadWorkspaces])

  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id)
    localStorage.setItem('kanban-active-workspace', id)
  }, [])

  useEffect(() => {
    loadWorkspaces()

    const savedId = localStorage.getItem('kanban-active-workspace')
    if (savedId) {
      setActiveWorkspaceId(savedId)
    }
  }, [loadWorkspaces])

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    loading,
    loadWorkspaces,
    saveWorkspace,
    deleteWorkspace,
    selectWorkspace,
  }
}
