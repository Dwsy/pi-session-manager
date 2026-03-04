#!/usr/bin/env node

import { checkContains, checkFiles, log } from './script-utils.mjs'

log('🔍 Session Viewer 搜索功能测试')
log('================================')
log()

log('📁 检查文件...')
const files = [
  'src/components/SearchBar.tsx',
  'src/utils/search.ts',
  'src/components/SessionViewer.tsx',
  'src/components/UserMessage.tsx',
  'src/components/AssistantMessage.tsx',
  'src/components/MarkdownContent.tsx',
]

const allExist = checkFiles(files)
log()

if (!allExist) {
  log('❌ 部分文件不存在，请检查实现')
  process.exit(1)
}

log('🔎 检查关键代码...')
checkContains('src/components/SearchBar.tsx', 'interface SearchBarProps', 'SearchBar 组件定义', 'SearchBar 组件定义缺失')
checkContains('src/utils/search.ts', 'highlightSearchInHTML', 'highlightSearchInHTML 函数', 'highlightSearchInHTML 函数缺失')
checkContains('src/utils/search.ts', 'containsSearchQuery', 'containsSearchQuery 函数', 'containsSearchQuery 函数缺失')
checkContains('src/components/SessionViewer.tsx', 'showSearch', 'SessionViewer 搜索状态', 'SessionViewer 搜索状态缺失')
checkContains('src/components/SessionViewer.tsx', /metaKey.*ctrlKey.*key.*f/, '快捷键监听 (cmd+f / ctrl+f)', '快捷键监听缺失')
checkContains('src/components/UserMessage.tsx', 'searchQuery', 'UserMessage searchQuery 参数', 'UserMessage searchQuery 参数缺失')
checkContains('src/components/AssistantMessage.tsx', 'searchQuery', 'AssistantMessage searchQuery 参数', 'AssistantMessage searchQuery 参数缺失')
checkContains('src/styles/session.css', 'search-bar', '搜索栏样式', '搜索栏样式缺失')
checkContains('src/styles/session.css', 'search-highlight', '搜索高亮样式', '搜索高亮样式缺失')
checkContains('src/i18n/locales/en-US.ts', /placeholder.*Search in session/, '英文翻译', '英文翻译缺失')
checkContains('src/i18n/locales/zh-CN.ts', /placeholder.*在会话中搜索/, '中文翻译', '中文翻译缺失')

log()
log('================================')
log('✅ 所有检查完成！')
log()
log('📝 使用说明：')
log('1. 按 Cmd+F (macOS) 或 Ctrl+F (Windows/Linux) 打开搜索')
log('2. 输入关键词进行搜索')
log('3. 使用 Enter / Shift+Enter 导航结果')
log('4. 按 Esc 关闭搜索')
log()
log('📖 详细文档: SEARCH_FEATURE.md')
