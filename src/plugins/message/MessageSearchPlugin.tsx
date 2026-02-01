import { MessageSquare } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import type { SearchContext, SearchPluginResult } from '../types'
import type { SessionInfo } from '../../types'

/**
 * 消息搜索插件
 * 使用 SQLite FTS5 全文搜索，快速高效
 */
export class MessageSearchPlugin extends BaseSearchPlugin {
  id = 'message-search'
  name = '消息搜索'
  icon = MessageSquare
  description = '搜索用户消息和助手回复'
  keywords = ['message', 'content', 'text', 'conversation', '消息', '内容', '对话']
  priority = 80

  private truncateText(text: string, maxLength: number): string {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }
  
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    console.log('[MessageSearchPlugin] Starting FTS5 search for:', query)
    console.log('[MessageSearchPlugin] Search current project only:', context.searchCurrentProjectOnly)
    
    try {
      // 使用 SQLite FTS5 搜索，快速且高效
      const sessions = await invoke<SessionInfo[]>('search_sessions_fts', {
        query,
        limit: 50 // 最多返回 50 个会话
      })
      
      console.log('[MessageSearchPlugin] FTS5 returned sessions:', sessions.length)
      
      // 如果启用了"只搜索当前项目"，过滤结果
      const filteredSessions = context.searchCurrentProjectOnly && context.selectedProject
        ? sessions.filter(s => s.cwd === context.selectedProject)
        : sessions
      
      console.log('[MessageSearchPlugin] After project filter:', filteredSessions.length)
      
      // 转换为插件结果格式
      const pluginResults = filteredSessions.map(session => {
        const score = this.fuzzyMatch(query, session.all_messages_text)
        
        return {
          id: `session-${session.id}`,
          pluginId: this.id,
          title: session.name || this.truncateText(session.first_message, 60),
          subtitle: this.getProjectName(session.cwd),
          description: `${context.t('session.messageCount', { count: session.message_count, defaultValue: `${session.message_count} 条消息` })} • ${this.formatDate(session.modified)}`,
          icon: <MessageSquare className="w-4 h-4 text-blue-400" />,
          metadata: {
            sessionId: session.id,
            sessionPath: session.path,
            session
          },
          score,
          highlights: [
            ...this.calculateHighlights(query, session.name || '', 'title'),
            ...this.calculateHighlights(query, session.first_message, 'title')
          ]
        }
      }).slice(0, 20) // 最多显示 20 条结果
      
      console.log('[MessageSearchPlugin] Returning plugin results:', pluginResults.length)
      return pluginResults
    } catch (error) {
      console.error('[MessageSearchPlugin] FTS5 search failed:', error)
      return []
    }
  }
  
  onSelect(result: SearchPluginResult, context: SearchContext): void {
    if (!result.metadata?.session) {
      console.warn('[MessageSearchPlugin] Result metadata is missing')
      return
    }
    const session = result.metadata.session as SessionInfo
    context.setSelectedSession(session)
    context.setSelectedProject(session.cwd)
    context.closeCommandMenu()
  }
  
  private getProjectName(cwd: string): string {
    return cwd.split('/').pop() || cwd
  }
  
  private formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diff = now.getTime() - dateObj.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days} 天前`
    if (days < 30) return `${Math.floor(days / 7)} 周前`
    if (days < 365) return `${Math.floor(days / 30)} 月前`
    return `${Math.floor(days / 365)} 年前`
  }
}
