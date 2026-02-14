import { MessageSquare } from 'lucide-react'
import { invoke } from '../../transport'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import type { SearchContext, SearchPluginResult } from '../types'
import type { SessionInfo } from '../../types'

/**
 * 消息搜索插件
 * 使用 SQLite FTS5 全文搜索，快速高效
 */
export class MessageSearchPlugin extends BaseSearchPlugin {
  id = 'message-search'
  icon = MessageSquare
  keywords = ['message', 'content', 'text', 'conversation', '消息', '内容', '对话']
  priority = 80
  
  get name(): string {
    return this.context?.t('plugins.message.name', '消息搜索') || '消息搜索'
  }
  
  get description(): string {
    return this.context?.t('plugins.message.description', '搜索用户消息和助手回复') || '搜索用户消息和助手回复'
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }
  
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    // 保存 context 以便访问 i18n
    this.setContext(context)
    
    try {
      // 使用 SQLite FTS5 搜索，快速且高效
      const sessions = await invoke<SessionInfo[]>('search_sessions_fts', {
        query,
        limit: 50 // 最多返回 50 个会话
      })
      
      // 如果启用了"只搜索当前项目"，过滤结果
      const filteredSessions = context.searchCurrentProjectOnly && context.selectedProject
        ? sessions.filter(s => s.cwd === context.selectedProject)
        : sessions
      
      // 转换为插件结果格式
      const pluginResults = filteredSessions.map(session => {
        const score = this.fuzzyMatch(query, session.first_message)
        
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
    if (!this.context) return String(date)
    
    const dateObj = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diff = now.getTime() - dateObj.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return this.context.t('time.today')
    if (days === 1) return this.context.t('time.yesterday')
    if (days < 7) return this.context.t('time.daysAgo', { count: days })
    if (days < 30) {
      const weeks = Math.floor(days / 7)
      return this.context.t('time.weeksAgo', { count: weeks })
    }
    if (days < 365) {
      const months = Math.floor(days / 30)
      return this.context.t('time.monthsAgo', { count: months })
    }
    const years = Math.floor(days / 365)
    return this.context.t('time.yearsAgo', { count: years })
  }
}
