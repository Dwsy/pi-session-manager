#!/usr/bin/env node

import { commandExists, log, runChecked } from './script-utils.mjs'

log('🚀 Pi Session Manager - 侧边栏改进测试')
log('========================================')
log()

log('📦 检查依赖...')
if (!commandExists('node')) {
  log('❌ Node.js 未安装')
  process.exit(1)
}
if (!commandExists('cargo')) {
  log('❌ Rust 未安装')
  process.exit(1)
}

log('✅ 依赖检查通过')
log()

log('📋 改进内容:')
log('  ✅ 树形连接线 (├─, └─, │)')
log('  ✅ 活动标记 (•, ·)')
log('  ✅ 统一颜色方案')
log('  ✅ 搜索和过滤')
log('  ✅ 状态栏显示')
log()

log('🧪 测试步骤:')
log('  1. 打开应用后，选择一个会话')
log('  2. 点击左上角的菜单按钮 (☰) 打开侧边栏')
log('  3. 检查树形连接线是否正确显示')
log('  4. 测试搜索功能')
log('  5. 测试过滤功能')
log('  6. 点击节点测试跳转')
log()

log('📚 参考文档:')
log('  - SIDEBAR_SUMMARY.md - 改进总结')
log('  - SIDEBAR_TEST_GUIDE.md - 测试指南')
log('  - SIDEBAR_COMPARISON.md - 对比文档')
log()

log('🎬 启动应用...')
log()

runChecked('npm', ['run', 'tauri:dev'])
