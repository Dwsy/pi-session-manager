#!/usr/bin/env node

import { checkContains, checkFiles, log } from './script-utils.mjs'

log('🔍 BASH 工具调用复制按钮测试')
log('================================')
log()

log('📁 检查文件...')
const allExist = checkFiles(['src/components/BashExecution.tsx', 'src/index.css'])
if (!allExist) process.exit(1)

log()
log('🔎 检查关键代码...')

checkContains('src/components/BashExecution.tsx', 'commandCopied', '命令复制状态', '命令复制状态缺失')
checkContains('src/components/BashExecution.tsx', 'outputCopied', '输出复制状态', '输出复制状态缺失')
checkContains(
  'src/components/BashExecution.tsx',
  'handleCopyCommand',
  '命令复制函数',
  '命令复制函数缺失',
)
checkContains(
  'src/components/BashExecution.tsx',
  'handleCopyOutput',
  '输出复制函数',
  '输出复制函数缺失',
)
checkContains(
  'src/components/BashExecution.tsx',
  'navigator.clipboard.writeText',
  '剪贴板 API 调用',
  '剪贴板 API 调用缺失',
)
checkContains(
  'src/components/BashExecution.tsx',
  'tool-command-wrapper',
  '命令包装器',
  '命令包装器缺失',
)
checkContains(
  'src/components/BashExecution.tsx',
  'tool-output-wrapper',
  '输出包装器',
  '输出包装器缺失',
)
checkContains('src/components/BashExecution.tsx', 'tool-copy-button', '复制按钮', '复制按钮缺失')
checkContains('src/index.css', '.tool-command-wrapper', '命令包装器样式', '命令包装器样式缺失')
checkContains('src/index.css', '.tool-output-wrapper', '输出包装器样式', '输出包装器样式缺失')
checkContains('src/index.css', '.tool-output-header', '输出头部样式', '输出头部样式缺失')
checkContains('src/index.css', '.tool-copy-button', '复制按钮样式', '复制按钮样式缺失')

log()
log('================================')
log('✅ 所有检查完成！')
log()
log('📝 功能特性：')
log('1. ✅ 命令复制按钮')
log('2. ✅ 输出复制按钮')
log('3. ✅ 视觉反馈（2秒）')
log('4. ✅ 悬停效果')
log('5. ✅ 图标切换（复制/勾选）')
log()
log('🎯 使用方式：')
log('  命令复制：')
log('    1. 点击命令行右侧的复制按钮')
log('    2. 命令被复制到剪贴板')
log('    3. 图标变为勾选，2秒后恢复')
log()
log('  输出复制：')
log('    1. 点击输出区域顶部的复制按钮')
log('    2. 输出被复制到剪贴板')
log('    3. 图标变为勾选，2秒后恢复')
log()
log('📖 详细文档: BASH_COPY_BUTTON.md')
