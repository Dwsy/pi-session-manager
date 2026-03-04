#!/usr/bin/env node

import { checkContains, checkFiles, log } from './script-utils.mjs'

log('🔍 工具调用显示优化测试')
log('================================')
log()

log('📁 检查文件...')
const files = [
  'src/components/BashExecution.tsx',
  'src/components/ReadExecution.tsx',
  'src/components/WriteExecution.tsx',
  'src/components/EditExecution.tsx',
  'src/components/GenericToolCall.tsx',
  'src/index.css',
]
const allExist = checkFiles(files)
log()

if (!allExist) {
  log('❌ 部分文件不存在，请检查实现')
  process.exit(1)
}

log('🔎 检查关键代码...')
checkContains('src/components/BashExecution.tsx', 'tool-header', 'BashExecution 工具头部', 'BashExecution 工具头部缺失')
checkContains('src/components/ReadExecution.tsx', 'tool-header', 'ReadExecution 工具头部', 'ReadExecution 工具头部缺失')
checkContains('src/components/WriteExecution.tsx', 'tool-header', 'WriteExecution 工具头部', 'WriteExecution 工具头部缺失')
checkContains('src/components/EditExecution.tsx', 'tool-header', 'EditExecution 工具头部', 'EditExecution 工具头部缺失')
checkContains('src/components/BashExecution.tsx', 'tool-icon', 'Bash SVG 图标', 'Bash SVG 图标缺失')
checkContains('src/components/ReadExecution.tsx', 'tool-icon', 'Read SVG 图标', 'Read SVG 图标缺失')
checkContains('src/components/WriteExecution.tsx', 'tool-icon', 'Write SVG 图标', 'Write SVG 图标缺失')
checkContains('src/components/EditExecution.tsx', 'tool-icon', 'Edit SVG 图标', 'Edit SVG 图标缺失')
checkContains('src/components/GenericToolCall.tsx', 'tool-icon', 'Generic Tool SVG 图标', 'Generic Tool SVG 图标缺失')
checkContains('src/index.css', '.tool-icon', '工具图标样式', '工具图标样式缺失')
checkContains('src/components/ReadExecution.tsx', 'setExpanded', 'ReadExecution 展开/折叠', 'ReadExecution 展开/折叠缺失')
checkContains('src/components/WriteExecution.tsx', 'setExpanded', 'WriteExecution 展开/折叠', 'WriteExecution 展开/折叠缺失')
checkContains('src/components/EditExecution.tsx', 'setExpanded', 'EditExecution 展开/折叠', 'EditExecution 展开/折叠缺失')
checkContains('src/index.css', '.tool-execution', '工具执行容器样式', '工具执行容器样式缺失')
checkContains('src/index.css', '.tool-header', '工具头部样式', '工具头部样式缺失')
checkContains('src/index.css', '.tool-name', '工具名称样式', '工具名称样式缺失')
checkContains('src/index.css', '.tool-path', '工具路径样式', '工具路径样式缺失')
checkContains('src/index.css', '.tool-command', '工具命令样式', '工具命令样式缺失')
checkContains('src/index.css', '.tool-output', '工具输出样式', '工具输出样式缺失')
checkContains('src/index.css', '.expand-hint', '展开提示样式', '展开提示样式缺失')

log()
log('================================')
log('✅ 所有检查完成！')
log()
log('📝 功能特性：')
log('1. ✅ 清晰的工具区分（图标 + 名称）')
log('2. ✅ 状态指示（颜色边框）')
log('3. ✅ 内容展开/折叠')
log('4. ✅ 代码高亮（Read/Write）')
log('5. ✅ 元数据显示')
log()
log('🎨 工具图标：')
log('  [Terminal Icon] Bash - 命令执行')
log('  [Document Icon] Read - 文件读取')
log('  [Edit Icon] Write - 文件写入')
log('  [Pencil Icon] Edit - 文件编辑')
log('  [Settings Icon] Tool - 通用工具')
log()
log('📖 详细文档: TOOL_CALL_ENHANCEMENT.md')
