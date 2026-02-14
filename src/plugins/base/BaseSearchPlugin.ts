import type { SearchPlugin, SearchContext, SearchPluginResult, HighlightRange } from '../types'

/**
 * 搜索插件基类
 * 提供通用功能和默认实现
 */
export abstract class BaseSearchPlugin implements SearchPlugin {
  abstract id: string
  abstract name: string
  abstract icon: React.ComponentType<{ className?: string }>
  abstract description: string
  abstract keywords: string[]
  
  priority: number = 50 // 默认优先级
  
  // 存储 context 以便子类访问 i18n
  protected context?: SearchContext
  
  /**
   * 设置搜索上下文（包含 i18n）
   */
  setContext(context: SearchContext): void {
    this.context = context
  }
  
  /**
   * 抽象搜索方法，子类必须实现
   */
  abstract search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]>
  
  /**
   * 默认选中处理（可覆盖）
   */
  onSelect(_result: SearchPluginResult, _context: SearchContext): void {
    // Default: do nothing, subclasses should override
  }
  
  /**
   * 默认启用检查（可覆盖）
   */
  isEnabled(_context: SearchContext): boolean {
    return true
  }
  
  /**
   * 工具方法：模糊匹配
   * @param query 查询字符串
   * @param text 目标文本
   * @returns 匹配分数（0-1）
   */
  protected fuzzyMatch(query: string, text: string): number {
    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()
    
    // 精确匹配
    if (lowerText === lowerQuery) return 1.0
    
    // 包含匹配
    if (lowerText.includes(lowerQuery)) {
      const position = lowerText.indexOf(lowerQuery)
      const positionScore = 1 - (position / lowerText.length)
      return 0.8 * positionScore
    }
    
    // 模糊匹配（字符顺序）
    let queryIndex = 0
    let textIndex = 0
    let matches = 0
    
    while (queryIndex < lowerQuery.length && textIndex < lowerText.length) {
      if (lowerQuery[queryIndex] === lowerText[textIndex]) {
        matches++
        queryIndex++
      }
      textIndex++
    }
    
    if (matches === lowerQuery.length) {
      return 0.5 * (matches / lowerText.length)
    }
    
    return 0
  }
  
  /**
   * 工具方法：计算高亮范围
   * @param query 查询字符串
   * @param text 目标文本
   * @param field 字段名称
   * @returns 高亮范围数组
   */
  protected calculateHighlights(
    query: string,
    text: string,
    field: 'title' | 'subtitle' | 'description'
  ): HighlightRange[] {
    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()
    const highlights: HighlightRange[] = []
    
    let index = lowerText.indexOf(lowerQuery)
    while (index !== -1) {
      highlights.push({
        start: index,
        end: index + query.length,
        field
      })
      index = lowerText.indexOf(lowerQuery, index + 1)
    }
    
    return highlights
  }
}
