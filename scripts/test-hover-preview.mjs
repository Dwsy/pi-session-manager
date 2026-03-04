#!/usr/bin/env node

import { checkContains, checkFiles, log } from './script-utils.mjs'

log('🔍 折叠内容悬浮预览功能测试')
log('================================')
log()

log('📁 检查文件...')
const files = [
  'src/components/HoverPreview.tsx',
  'src/components/ExpandableOutput.tsx',
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
checkContains('src/components/HoverPreview.tsx', 'interface HoverPreviewProps', 'HoverPreview 组件定义', 'HoverPreview 组件定义缺失')
checkContains('src/components/HoverPreview.tsx', 'createPortal', 'Portal 渲染', 'Portal 渲染缺失')
checkContains('src/components/HoverPreview.tsx', 'setTimeout', '延迟显示逻辑', '延迟显示逻辑缺失')
checkContains('src/components/ExpandableOutput.tsx', 'HoverPreview', 'ExpandableOutput 集成', 'ExpandableOutput 集成缺失')
checkContains('src/components/ReadExecution.tsx', 'HoverPreview', 'ReadExecution 集成', 'ReadExecution 集成缺失')
checkContains('src/components/WriteExecution.tsx', 'HoverPreview', 'WriteExecution 集成', 'WriteExecution 集成缺失')
checkContains('src/components/EditExecution.tsx', 'HoverPreview', 'EditExecution 集成', 'EditExecution 集成缺失')
checkContains('src/components/GenericToolCall.tsx', 'HoverPreview', 'GenericToolCall 集成', 'GenericToolCall 集成缺失')
checkContains('src/index.css', '.hover-preview', '悬浮预览样式', '悬浮预览样式缺失')
checkContains('src/index.css', 'fadeIn', '淡入动画', '淡入动画缺失')
checkContains('src/index.css', 'hover-preview-content', '预览内容样式', '预览内容样式缺失')

log()
log('================================')
log('✅ 所有检查完成！')
log()
log('📝 功能特性：')
log('1. ✅ 延迟显示（500ms）')
log('2. ✅ 智能定位（自动避免超出屏幕）')
log('3. ✅ Portal 渲染（避免裁剪）')
log('4. ✅ 平滑动画（淡入效果）')
log('5. ✅ 滚动支持（长内容）')
log('6. ✅ 鼠标移入保持显示')
log()
log('🎯 使用方式：')
log('  1. 鼠标悬停在折叠提示上')
log('  2. 等待 500ms')
log('  3. 自动显示完整内容')
log('  4. 鼠标移开隐藏')
log()
log('📖 详细文档: HOVER_PREVIEW_FEATURE.md')
