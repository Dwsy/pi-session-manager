/**
 * 在 HTML 字符串中高亮搜索关键词
 * @param html - 原始 HTML 字符串
 * @param searchQuery - 搜索关键词
 * @returns 高亮后的 HTML 字符串
 */
export function highlightSearchInHTML(html: string, searchQuery: string): string {
  if (!searchQuery.trim()) {
    return html
  }

  // 转义正则表达式特殊字符
  const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // 创建正则表达式（大小写不敏感）
  const regex = new RegExp(`(${escapedQuery})`, 'gi')

  // 临时替换 HTML 标签，避免在标签内搜索
  const tagPlaceholders: string[] = []
  let processedHtml = html.replace(/<[^>]+>/g, (match) => {
    const placeholder = `__TAG_${tagPlaceholders.length}__`
    tagPlaceholders.push(match)
    return placeholder
  })

  // 高亮搜索关键词
  processedHtml = processedHtml.replace(regex, '<mark class="search-highlight">$1</mark>')

  // 恢复 HTML 标签
  tagPlaceholders.forEach((tag, index) => {
    processedHtml = processedHtml.replace(`__TAG_${index}__`, tag)
  })

  return processedHtml
}

/**
 * 在纯文本中搜索关键词
 * @param text - 纯文本
 * @param searchQuery - 搜索关键词
 * @returns 是否包含关键词
 */
export function containsSearchQuery(text: string, searchQuery: string): boolean {
  if (!searchQuery.trim()) {
    return false
  }

  return text.toLowerCase().includes(searchQuery.toLowerCase())
}

/**
 * 提取消息的纯文本内容（用于搜索）
 * @param html - HTML 字符串
 * @returns 纯文本
 */
export function extractTextFromHTML(html: string): string {
  // 移除 HTML 标签
  const text = html.replace(/<[^>]+>/g, ' ')
  // 解码 HTML 实体
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}
