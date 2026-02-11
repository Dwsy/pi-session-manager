import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { invoke, listen } from '../transport'
import { X, Plus, ChevronDown } from 'lucide-react'
import { getPlatformDefaults } from './settings/types'

interface ShellInfo {
  label: string
  path: string
}

const TERM_THEME = {
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

interface Tab {
  id: string
  shell: string
  label: string
}

interface TerminalPanelProps {
  isOpen: boolean
  onClose: () => void
  cwd: string
  height?: number
  defaultShell?: string
  fontSize?: number
}

function TerminalTabContent({ id, shell, cwd, isVisible, fontSize }: {
  id: string
  shell: string
  cwd: string
  isVisible: boolean
  fontSize: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: TERM_THEME,
      scrollback: 10000,
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

    setTimeout(() => {
      fit.fit()
      const { rows, cols } = term
      invoke('terminal_create', { id, cwd, shell })
        .then(() => {
          invoke('terminal_resize', { id, rows, cols }).catch(() => {})
        })
        .catch((err: unknown) => {
          term.writeln(`\r\n\x1b[31mFailed to create terminal: ${err}\x1b[0m`)
        })
    }, 50)

    const unlistenPromise = listen<{ id: string; data: string }>('terminal-output', (event) => {
      if (event.payload.id === id) {
        term.write(event.payload.data)
      }
    })

    term.onData((data) => {
      invoke('terminal_write', { id, data }).catch(() => {})
    })

    const handleResize = () => {
      fit.fit()
      const { rows, cols } = term
      invoke('terminal_resize', { id, rows, cols }).catch(() => {})
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      unlistenPromise.then(fn => fn()).catch(() => {})
      invoke('terminal_close', { id }).catch(() => {})
      term.dispose()
    }
  }, [id, cwd, shell, fontSize])

  useEffect(() => {
    if (isVisible) {
      setTimeout(() => {
        fitRef.current?.fit()
        termRef.current?.focus()
      }, 50)
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

export function TerminalPanel({ isOpen, onClose, cwd, height = 280, defaultShell: propShell, fontSize = 13 }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [defaultShell, setDefaultShell] = useState(propShell || getPlatformDefaults().defaultShell)
  const [availableShells, setAvailableShells] = useState<ShellInfo[]>([])
  const [showShellMenu, setShowShellMenu] = useState(false)
  const tabCounter = useRef(0)

  useEffect(() => {
    invoke<[string, string][]>('get_available_shells')
      .then(shells => setAvailableShells(shells.map(([label, path]) => ({ label, path }))))
      .catch(() => setAvailableShells([{ label: 'sh', path: '/bin/sh' }]))
  }, [])

  useEffect(() => {
    if (propShell) {
      setDefaultShell(propShell)
    } else {
      invoke<string>('get_default_shell').then(setDefaultShell).catch(() => {})
    }
  }, [propShell])

  const addTab = useCallback((shell?: string) => {
    const id = `term-${++tabCounter.current}`
    const s = shell || defaultShell
    setTabs(prev => [...prev, { id, shell: s, label: s.split('/').pop() || 'sh' }])
    setActiveTabId(id)
    setShowShellMenu(false)
  }, [defaultShell])

  useEffect(() => {
    if (isOpen && tabs.length === 0) {
      addTab()
    }
  }, [isOpen, tabs.length, addTab])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId)
      setActiveTabId(current =>
        current === tabId
          ? (next.length > 0 ? next[next.length - 1].id : null)
          : current
      )
      if (next.length === 0) onClose()
      return next
    })
  }, [onClose])

  // Dismiss shell menu on outside click
  useEffect(() => {
    if (!showShellMenu) return
    const handler = () => setShowShellMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showShellMenu])

  if (tabs.length === 0 && !isOpen) return null

  return (
    <div
      className="border-t border-[#2c2d3b] bg-[#0d0d0d] flex flex-col"
      style={{ height: isOpen ? height : 0, overflow: 'hidden' }}
    >
      {/* Tab bar */}
      <div className="flex items-center bg-[#1a1b26] border-b border-[#2c2d3b] select-none h-[30px] px-1">
        <div className="flex items-center flex-1 overflow-x-auto gap-px min-w-0">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`group flex items-center gap-1 px-2 py-1 text-[11px] cursor-pointer shrink-0 transition-colors ${
                tab.id === activeTabId
                  ? 'bg-[#0d0d0d] text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span>{tab.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="p-0.5 rounded hover:bg-[#333] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="relative flex items-center gap-0.5 ml-1 shrink-0">
          <button
            onClick={() => addTab()}
            className="p-1 rounded hover:bg-[#2c2d3b] text-gray-400 hover:text-white"
            title="New terminal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowShellMenu(!showShellMenu) }}
            className="p-0.5 rounded hover:bg-[#2c2d3b] text-gray-400 hover:text-white"
            title="Select shell"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          {showShellMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[#252636] border border-[#2c2d3b] rounded shadow-lg z-50 py-1 min-w-[120px]">
              {availableShells.map(s => (
                <button
                  key={s.path}
                  onClick={(e) => { e.stopPropagation(); addTab(s.path) }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-[#2c2d3b] hover:text-white"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
          <TerminalTabContent
            key={tab.id}
            id={tab.id}
            shell={tab.shell}
            cwd={cwd}
            isVisible={tab.id === activeTabId}
            fontSize={fontSize}
          />
        ))}
      </div>
    </div>
  )
}

export default TerminalPanel
