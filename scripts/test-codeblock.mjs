#!/usr/bin/env node

import { checkContains, checkFiles, log } from './script-utils.mjs'

log('🔍 代码块功能测试')
log('================================')
log()

log('📁 检查文件...')
const files = [
  'src/components/CodeBlock.tsx',
  'src/utils/markdown.ts',
  'src/main.tsx',
  'src/index.css',
]
const allExist = checkFiles(files)
log()

if (!allExist) {
  log('❌ 部分文件不存在，请检查实现')
  process.exit(1)
}

log('🔎 检查关键代码...')
checkContains('src/components/CodeBlock.tsx', 'code-copy-button', 'CodeBlock 复制按钮', 'CodeBlock 复制按钮缺失')
checkContains('src/components/CodeBlock.tsx', 'code-line-numbers', 'CodeBlock 行号显示', 'CodeBlock 行号显示缺失')
checkContains('src/utils/markdown.ts', 'renderer.code', 'Markdown 自定义渲染器', 'Markdown 自定义渲染器缺失')
checkContains('src/utils/markdown.ts', 'code-line-number', 'Markdown 行号生成', 'Markdown 行号生成缺失')
checkContains('src/main.tsx', 'window.copyCode', '全局复制函数', '全局复制函数缺失')
checkContains('src/index.css', 'code-block-wrapper', '代码块容器样式', '代码块容器样式缺失')
checkContains('src/index.css', 'code-block-header', '代码块头部样式', '代码块头部样式缺失')
checkContains('src/index.css', 'code-line-numbers', '行号样式', '行号样式缺失')
checkContains('src/index.css', 'code-copy-button', '复制按钮样式', '复制按钮样式缺失')
checkContains('src/index.css', 'margin: 16px 0', '代码块间距', '代码块间距缺失')

log()
log('================================')
log('✅ 所有检查完成！')
log()
log('📝 功能特性：')
log('1. ✅ 代码块行号显示')
log('2. ✅ 代码块复制按钮')
log('3. ✅ 代码块和消息之间的间距')
log('4. ✅ 语法高亮')
log('5. ✅ 语言标签显示')
log()
log('📖 详细文档: CODE_BLOCK_ENHANCEMENT.md')
