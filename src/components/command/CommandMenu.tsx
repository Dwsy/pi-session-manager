import { Command } from 'cmdk'
import { Search, Loader2, FolderOpen, MessageSquare, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import type { SearchPluginResult, SearchContext } from '../../plugins/types'
import { useSearchPlugins } from '../../hooks/useSearchPlugins'
import CommandItem from './CommandItem'
import CommandEmpty from './CommandEmpty'
import CommandLoading from './CommandLoading'
import CommandHints from './CommandHints'
import CommandError from './CommandError'

interface CommandMenuProps {
  query: string
  setQuery: (query: string) => void
  results: SearchPluginResult[]
  setResults: (results: SearchPluginResult[]) => void
  isSearching: boolean
  setIsSearching: (isSearching: boolean) => void
  context: SearchContext
  onClose: () => void
  searchCurrentProjectOnly: boolean
  setSearchCurrentProjectOnly: (value: boolean) => void
}

// Tab 类型定义
type TabType = 'all' | 'message' | 'session' | 'project'

// Tab 配置（会在组件中使用 i18n）
const TABS: { id: TabType; key: string; pluginId?: string }[] = [
  { id: 'all', key: 'tabs.all' },
  { id: 'message', key: 'tabs.message', pluginId: 'message-search' },
  { id: 'session', key: 'tabs.session', pluginId: 'session-search' },
  { id: 'project', key: 'tabs.project', pluginId: 'project-search' },
]

export default function CommandMenu({
  query,
  setQuery,
  results,
  setResults,
  isSearching,
  setIsSearching,
  context,
  onClose,
  searchCurrentProjectOnly,
  setSearchCurrentProjectOnly
}: CommandMenuProps) {
  const { t } = useTranslation()
  const { registry, search } = useSearchPlugins(context)
  const debounceRef = useRef<NodeJS.Timeout>()
  const abortControllerRef = useRef<AbortController>()
  const [searchError, setSearchError] = useState<string | undefined>()
  const [activeTab, setActiveTab] = useState<TabType>('all')
  
  // 获取当前项目名称
  const currentProjectName = context.selectedProject 
    ? context.selectedProject.split('/').pop() || context.selectedProject
    : null
  
  // 防抖搜索
  useEffect(() => {
    // 取消之前的搜索
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      setSearchError(undefined)
      return
    }
    
    setIsSearching(true)
    setSearchError(undefined)
    
    debounceRef.current = setTimeout(async () => {
      try {
        abortControllerRef.current = new AbortController()
        
        // 添加超时保护
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Search timeout after 15 seconds'))
          }, 15000) // 15秒总超时
        })
        
        const searchPromise = search(query)
        const searchResults = await Promise.race([searchPromise, timeoutPromise])
        
        if (!abortControllerRef.current.signal.aborted) {
          setResults(searchResults)
          setIsSearching(false)
        }
      } catch (error) {
        console.error('[CommandMenu] Search error:', error)
        if (error instanceof Error && error.name !== 'AbortError') {
          setSearchError(error.message)
          // 显示错误状态
          setResults([])
        }
        setIsSearching(false)
      }
    }, 300)
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, search]) // 只依赖 query 和 search
  
  // 清理
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])
  
  // 按插件分组结果
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.pluginId]) {
      acc[result.pluginId] = []
    }
    acc[result.pluginId].push(result)
    return acc
  }, {} as Record<string, SearchPluginResult[]>)
  
  return (
    <Command
      className="w-full"
      shouldFilter={false} // 我们自己处理过滤
    >
      {/* 搜索框 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2b36]">
        <Search className="w-5 h-5 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('command.placeholder', '搜索会话、项目、消息...')}
          className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
        />
        {isSearching && (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        )}
        
        {/* 当前项目过滤按钮 - 始终显示 */}
        <button
          onClick={() => {
            if (currentProjectName) {
              setSearchCurrentProjectOnly(!searchCurrentProjectOnly)
            }
          }}
          disabled={!currentProjectName}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors
            ${!currentProjectName 
              ? 'bg-[#1f2029] text-muted-foreground/50 cursor-not-allowed border border-[#2a2b36]'
              : searchCurrentProjectOnly 
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30' 
                : 'bg-[#252636] text-muted-foreground hover:bg-[#2a2b36] border border-transparent'
            }
          `}
          title={
            !currentProjectName
              ? t('command.noProjectSelected', '请先选择项目')
              : searchCurrentProjectOnly 
                ? t('command.searchAllProjects', '搜索所有项目') 
                : t('command.searchCurrentProject', '只搜索当前项目')
          }
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="max-w-[100px] truncate">
            {currentProjectName || t('command.allProjects', '所有项目')}
          </span>
        </button>
        
        <kbd className="px-2 py-1 text-xs text-muted-foreground bg-[#252636] rounded">
          ESC
        </kbd>
      </div>
      
      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#2a2b36] bg-[#1a1b26]">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          let Icon = null
          if (tab.id === 'message') Icon = MessageSquare
          else if (tab.id === 'session') Icon = FileText
          else if (tab.id === 'project') Icon = FolderOpen

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors
                ${isActive
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[#2a2b36]'
                }
              `}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{t(`command.${tab.key}`)}</span>
              {tab.pluginId && groupedResults[tab.pluginId] && (
                <span className={`
                  px-1.5 py-0.5 rounded text-[10px]
                  ${isActive ? 'bg-blue-500/30 text-blue-300' : 'bg-[#2a2b36] text-muted-foreground'}
                `}>
                  {groupedResults[tab.pluginId]?.length || 0}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 结果列表 */}
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        {isSearching && <CommandLoading />}
        
        {!isSearching && searchError && (
          <CommandError error={searchError} />
        )}
        
        {!isSearching && !searchError && results.length === 0 && query && (
          <CommandEmpty query={query} />
        )}
        
        {!isSearching && !searchError && !query && (
          <CommandHints />
        )}
        
        {!isSearching && !searchError && Object.entries(groupedResults).map(([pluginId, pluginResults]) => {
          // 根据 activeTab 过滤结果
          if (activeTab !== 'all' && activeTab !== TABS.find(t => t.pluginId === pluginId)?.id) {
            return null
          }

          const plugin = registry.get(pluginId)
          if (!plugin) return null
          
          return (
            <Command.Group
              key={pluginId}
              heading={activeTab === 'all' ? plugin.name : undefined}
              className="mb-2"
            >
              {pluginResults.map(result => (
                <CommandItem
                  key={result.id}
                  result={result}
                  plugin={plugin}
                  onSelect={() => {
                    plugin.onSelect(result, context)
                    onClose()
                  }}
                />
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </Command>
  )
}
