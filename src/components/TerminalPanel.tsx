import { useEffect, useRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { invoke, listen } from '../transport'
import { X, Plus, ChevronDown, Maximize2, Minimize2 } from 'lucide-react'
import { getPlatformDefaults } from './settings/types'
import { useResolvedTheme } from '../hooks/useResolvedTheme'

interface ShellInfo { label: string; path: string }

const TERM_THEME_DARK = {
  background: '#0d0d0d',
  foreground: '#e6e6e6',
  cursor: '#e6e6e6',
  selectionBackground: '#264f78',
  black: '#0d0d0d',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
}

const TERM_THEME_LIGHT = {
  background: '#f8f9fa',
  foreground: '#1a1b2e',
  cursor: '#1a1b2e',
  selectionBackground: '#add6ff',
  black: '#1a1b2e',
  red: '#cd3131',
  green: '#00bc7c',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#e5e5e5',
  brightBlack: '#6b7280',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#1a1b2e',
}

interface Tab { id: string; shell: string; label: string }

interface TerminalPanelProps {
  isOpen: boolean
  onClose: () => void
  onMaximizedChange?: (maximized: boolean) => void
  cwd: string
  defaultShell?: string
  fontSize?: number
  pendingCommand?: string | null
  onCommandConsumed?: () => void
}

function TerminalTabContent({ id, shell, cwd, isVisible, fontSize, resolvedTheme }: {
  id: string; shell: string; cwd: string; isVisible: boolean; fontSize: number; resolvedTheme: 'dark' | 'light'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const resizeTimer = useRef<ReturnType<typeof setTimeout>>()

  const termTheme = resolvedTheme === 'light' ? TERM_THEME_LIGHT : TERM_THEME_DARK

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: termTheme,
      scrollback: 5000,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    termRef.current = term
    fitRef.current = fit

    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.key === '`') return false
      return true
    })

    fit.fit()
    const { rows, cols } = term

    const unlistenPromise = listen<{ id: string; data: string }>('terminal-output', (event) => {
      if (event.payload.id === id) term.write(event.payload.data)
    })

    invoke('terminal_create', { id, cwd, shell, rows, cols })
      .catch((err: unknown) => {
        term.writeln(`\r\n\x1b[31mFailed to create terminal: ${err}\x1b[0m`)
      })

    term.onData((data) => {
      invoke('terminal_write', { id, data }).catch(() => {})
    })

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) return
      clearTimeout(resizeTimer.current)
      resizeTimer.current = setTimeout(() => {
        if (fitRef.current && termRef.current) {
          fitRef.current.fit()
          const { rows, cols } = termRef.current
          invoke('terminal_resize', { id, rows, cols }).catch(() => {})
        }
      }, 50)
    })
    ro.observe(container)

    return () => {
      clearTimeout(resizeTimer.current)
      ro.disconnect()
      unlistenPromise.then(fn => fn()).catch(() => {})
      invoke('terminal_close', { id }).catch(() => {})
      term.dispose()
    }
  }, [id, cwd, shell, fontSize, termTheme])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = termTheme
    }
  }, [termTheme])

  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => {
        fitRef.current?.fit()
        termRef.current?.focus()
      })
    }
  }, [isVisible])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 p-1"
      style={{ display: isVisible ? 'block' : 'none' }}
    />
  )
}

/* ── TerminalPanel ── */
const MIN_HEIGHT = 120
const DEFAULT_HEIGHT = 280

export function TerminalPanel({ isOpen, onClose, onMaximizedChange, cwd, defaultShell: propShell, fontSize = 13, pendingCommand, onCommandConsumed }: TerminalPanelProps) {
  const { t } = useTranslation()
  const resolvedTheme = useResolvedTheme()
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [defaultShell, setDefaultShell] = useState(propShell || getPlatformDefaults().defaultShell)
  const [availableShells, setAvailableShells] = useState<ShellInfo[]>([])
  const [showShellMenu, setShowShellMenu] = useState(false)
  const tabCounter = useRef(0)

  // New states
  const [maximized, setMaximized] = useState(false)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [isDraggingResize, setIsDraggingResize] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Shells
  useEffect(() => {
    invoke<[string, string][]>('get_available_shells')
      .then(shells => setAvailableShells(shells.map(([label, path]) => ({ label, path }))))
      .catch(() => setAvailableShells([{ label: 'sh', path: '/bin/sh' }]))
  }, [])

  useEffect(() => {
    if (propShell) setDefaultShell(propShell)
    else invoke<string>('get_default_shell').then(setDefaultShell).catch(() => {})
  }, [propShell])

  // Tab management
  const addTab = useCallback((shell?: string) => {
    const id = `term-${++tabCounter.current}`
    const s = shell || defaultShell
    setTabs(prev => [...prev, { id, shell: s, label: s.split('/').pop() || 'sh' }])
    setActiveTabId(id)
    setShowShellMenu(false)
  }, [defaultShell])

  useEffect(() => {
    if (isOpen && tabs.length === 0) addTab()
  }, [isOpen, tabs.length, addTab])

  // Write pending command to active terminal after it's ready
  useEffect(() => {
    if (!pendingCommand || !activeTabId) return
    // Delay to ensure terminal_create has completed and shell is ready
    const timer = setTimeout(() => {
      invoke('terminal_write', { id: activeTabId, data: pendingCommand + '\n' }).catch(() => {})
      onCommandConsumed?.()
    }, 500)
    return () => clearTimeout(timer)
  }, [pendingCommand, activeTabId, onCommandConsumed])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId)
      setActiveTabId(current =>
        current === tabId ? (next.length > 0 ? next[next.length - 1].id : null) : current
      )
      if (next.length === 0) onClose()
      return next
    })
  }, [onClose])

  // Dismiss shell menu
  useEffect(() => {
    if (!showShellMenu) return
    const handler = () => setShowShellMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showShellMenu])

  // Maximize toggle
  const toggleMaximize = useCallback(() => {
    setMaximized(v => {
      onMaximizedChange?.(!v)
      return !v
    })
  }, [onMaximizedChange])

  // Drag resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (maximized) return
    setIsDraggingResize(true)
    const startY = e.clientY
    const startH = panelHeight

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      setPanelHeight(Math.max(MIN_HEIGHT, startH + delta))
    }
    const onUp = () => {
      setIsDraggingResize(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [maximized, panelHeight])

  // Tab rename
  const startRename = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return
    setEditingTabId(tabId)
    setEditValue(tab.label)
    setTimeout(() => editInputRef.current?.select(), 0)
  }, [tabs])

  const commitRename = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      setTabs(prev => prev.map(t => t.id === editingTabId ? { ...t, label: editValue.trim() } : t))
    }
    setEditingTabId(null)
  }, [editingTabId, editValue])

  // Tab drag reorder
  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDragTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
  }, [])

  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTabId(tabId)
  }, [])

  const handleTabDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!dragTabId || dragTabId === targetId) { setDragTabId(null); setDragOverTabId(null); return }
    setTabs(prev => {
      const dragged = prev.find(t => t.id === dragTabId)
      if (!dragged) return prev
      const without = prev.filter(t => t.id !== dragTabId)
      const targetIdx = without.findIndex(t => t.id === targetId)
      without.splice(targetIdx + 1, 0, dragged)
      return without
    })
    setDragTabId(null)
    setDragOverTabId(null)
  }, [dragTabId])

  if (tabs.length === 0 && !isOpen) return null

  const panelStyle: React.CSSProperties = maximized
    ? { flex: 1, minHeight: 0, overflow: 'hidden' }
    : { height: isOpen ? panelHeight : 0, overflow: 'hidden' }

  return (
    <div ref={panelRef} className="border-t border-border bg-background flex flex-col" style={panelStyle}>
      {/* Resize handle */}
      {isOpen && !maximized && (
        <div
          className="h-[3px] cursor-ns-resize hover:bg-blue-500/50 transition-colors flex-shrink-0"
          onMouseDown={handleResizeStart}
        />
      )}
      {isDraggingResize && <div className="fixed inset-0 z-[9999] cursor-ns-resize" />}

      {/* Tab bar */}
      <div className="flex items-center bg-surface border-b border-border select-none h-[30px] px-1 flex-shrink-0">
        {/* Tabs */}
        <div className="flex items-center flex-1 overflow-x-auto gap-px min-w-0">
          {tabs.map(tab => (
            <div
              key={tab.id}
              draggable={editingTabId !== tab.id}
              onDragStart={(e) => handleTabDragStart(e, tab.id)}
              onDragOver={(e) => handleTabDragOver(e, tab.id)}
              onDragEnd={() => { setDragTabId(null); setDragOverTabId(null) }}
              onDrop={(e) => handleTabDrop(e, tab.id)}
              className={`group flex items-center gap-1 px-2 py-1 text-[11px] cursor-pointer shrink-0 transition-colors ${
                tab.id === activeTabId ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
              } ${dragTabId === tab.id ? 'opacity-40' : ''} ${dragOverTabId === tab.id && dragTabId !== tab.id ? 'border-l-2 border-blue-400' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
              onDoubleClick={() => startRename(tab.id)}
            >
              {editingTabId === tab.id ? (
                <input
                  ref={editInputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingTabId(null) }}
                  className="bg-surface-dark text-foreground text-[11px] px-1 w-16 outline-none border border-blue-500 rounded-sm"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="truncate max-w-[100px]">{tab.label}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="p-0.5 rounded hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="relative flex items-center gap-0.5 ml-1 shrink-0">
          <button onClick={() => addTab()} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title={t('components.terminalPanel.newTerminal')}>
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowShellMenu(!showShellMenu) }} className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title={t('components.terminalPanel.selectShell')}>
            <ChevronDown className="h-3 w-3" />
          </button>
          {showShellMenu && (
            <div className="absolute top-full right-0 mt-1 bg-popover border border-border rounded shadow-lg z-50 py-1 min-w-[120px]">
              {availableShells.map(s => (
                <button key={s.path} onClick={(e) => { e.stopPropagation(); addTab(s.path) }} className="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <div className="w-px h-3.5 bg-border mx-0.5" />
          <button onClick={toggleMaximize} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title={maximized ? 'Restore panel' : 'Maximize panel'}>
            {maximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title={t('components.terminalPanel.hidePanel')}>
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
          <TerminalTabContent key={tab.id} id={tab.id} shell={tab.shell} cwd={cwd} isVisible={tab.id === activeTabId} fontSize={fontSize} resolvedTheme={resolvedTheme} />
        ))}
      </div>
    </div>
  )
}

export default TerminalPanel