import { useEffect, useState } from 'react'
import { useCommandMenu } from '../../hooks/useCommandMenu'
import type { SearchContext } from '../../plugins/types'
import CommandMenu from './CommandMenu'

interface CommandPaletteProps {
  context: SearchContext
}

export default function CommandPalette({ context }: CommandPaletteProps) {
  const {
    isOpen,
    open,
    close,
    query,
    setQuery,
    results,
    setResults,
    isSearching,
    setIsSearching
  } = useCommandMenu()
  
  const [searchCurrentProjectOnly, setSearchCurrentProjectOnly] = useState(false)
  
  // 创建增强的 context，包含搜索范围状态
  const enhancedContext: SearchContext = {
    ...context,
    searchCurrentProjectOnly
  }
  
  // 全局快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) 或 Ctrl+K (Windows/Linux) - 切换面板
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        isOpen ? close() : open()
      }
      
      // ESC 关闭
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        close()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, close, isOpen])
  
  // 打开时自动聚焦
  useEffect(() => {
    if (isOpen) {
      // 延迟聚焦，等待 DOM 渲染
      setTimeout(() => {
        const input = document.querySelector('[cmdk-input]') as HTMLInputElement
        if (input) {
          input.focus()
        }
      }, 100)
    }
  }, [isOpen])
  
  if (!isOpen) return null
  
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl max-h-[60vh] bg-background border border-border rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <CommandMenu
          query={query}
          setQuery={setQuery}
          results={results}
          setResults={setResults}
          isSearching={isSearching}
          setIsSearching={setIsSearching}
          context={enhancedContext}
          onClose={close}
          searchCurrentProjectOnly={searchCurrentProjectOnly}
          setSearchCurrentProjectOnly={setSearchCurrentProjectOnly}
        />
      </div>
    </div>
  )
}
