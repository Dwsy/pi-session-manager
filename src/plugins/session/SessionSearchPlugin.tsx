import { FileText } from 'lucide-react'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import type { SearchContext, SearchPluginResult } from '../types'

/**
 * 会话搜索插件
 * 搜索会话名称和元数据
 */
export class SessionSearchPlugin extends BaseSearchPlugin {
  id = 'session-search'
  icon = FileText
  keywords = ['session', 'file', 'conversation', '会话', '文件', '对话']
  priority = 60
  
  get name(): string {
    return this.context?.t('plugins.session.name', '会话搜索') || '会话搜索'
  }
  
  get description(): string {
    return this.context?.t('plugins.session.description', '搜索会话名称和元数据') || '搜索会话名称和元数据'
  }
  
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    // 保存 context 以便访问 i18n
    this.setContext(context)
    
    try {
      const results: SearchPluginResult[] = []
      
      // 如果启用了"只搜索当前项目"，过滤会话列表
      const sessionsToSearch = context.searchCurrentProjectOnly && context.selectedProject
        ? context.sessions.filter(s => s.cwd === context.selectedProject)
        : context.sessions
      
      for (const session of sessionsToSearch) {
        // 搜索会话名称
        const nameScore = session.name 
          ? this.fuzzyMatch(query, session.name)
          : 0
        
        // 搜索第一条消息
        const messageScore = this.fuzzyMatch(query, session.first_message) * 0.8
        
        // 搜索路径
        const pathScore = this.fuzzyMatch(query, session.path) * 0.5
        
        // 搜索项目路径
        const cwdScore = this.fuzzyMatch(query, session.cwd) * 0.3
        
        // 综合分数
        const score = Math.max(nameScore, messageScore, pathScore, cwdScore)
        
        if (score > 0) {
          results.push({
            id: `session-${session.id}`,
            pluginId: this.id,
            title: session.name || this.truncateText(session.first_message, 60),
            subtitle: this.getProjectName(session.cwd),
            description: this.getSessionDescription(session, context),
            icon: <FileText className="w-4 h-4 text-green-400" />,
            metadata: {
              session
            },
            score,
            highlights: [
              ...this.calculateHighlights(query, session.name || '', 'title'),
              ...this.calculateHighlights(query, session.first_message, 'title')
            ]
          })
        }
      }
      
      const finalResults = results.sort((a, b) => b.score - a.score).slice(0, 20)
      return finalResults
    } catch (error) {
      console.error('[SessionSearchPlugin] Search failed:', error)
      return []
    }
  }
  
  onSelect(result: SearchPluginResult, context: SearchContext): void {
    // 打开会话
    const session = result.metadata?.session
    
    if (session) {
      context.setSelectedSession(session)
      context.closeCommandMenu()
    }
  }
  
  /**
   * 获取会话描述
   */
  private getSessionDescription(session: any, context: SearchContext): string {
    const parts: string[] = []
    
    // 消息数量
    parts.push(context.t('session.messageCount', {
      count: session.message_count,
      defaultValue: `${session.message_count} 条消息`
    }))
    
    // 修改时间
    parts.push(this.formatRelativeTime(session.modified))
    
    return parts.join(' • ')
  }
  
  /**
   * 格式化相对时间
   */
  private formatRelativeTime(timestamp: string): string {
    if (!this.context) return timestamp
    
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const seconds = Math.floor(diff / 1000)
      
      // 小于 1 分钟
      if (seconds < 60) {
        return this.context.t('time.justNow')
      }
      
      // 小于 1 小时
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) {
        return this.context.t('time.minutesAgo', { count: minutes })
      }
      
      // 小于 24 小时
      const hours = Math.floor(minutes / 60)
      if (hours < 24) {
        return this.context.t('time.hoursAgo', { count: hours })
      }
      
      // 小于 7 天
      const days = Math.floor(hours / 24)
      if (days < 7) {
        return this.context.t('time.daysAgo', { count: days })
      }
      
      // 小于 30 天
      const weeks = Math.floor(days / 7)
      if (weeks < 4) {
        return this.context.t('time.weeksAgo', { count: weeks })
      }
      
      // 显示日期
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    } catch {
      return timestamp
    }
  }
  
  /**
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }
  
  /**
   * 获取项目名称
   */
  private getProjectName(path: string): string {
    const parts = path.split('/')
    return parts[parts.length - 1] || path
  }
}
