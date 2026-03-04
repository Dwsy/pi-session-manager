#!/usr/bin/env node

import { log } from './script-utils.mjs'

log('=== 清理 Badge 数据库 ===')
log()

log('📋 说明：')
log('  - 清理 localStorage 中的 badge 状态')
log('  - 所有 NEW/UPDATED badge 将消失')
log('  - 重启应用后，只有新增/修改的会话才会显示 badge')
log()

log('🧹 清理方法：')
log()
log('方法 1: 在浏览器控制台执行（推荐）')
log('----------------------------------------')
log("localStorage.removeItem('pi-session-manager-badge-states')")
log('location.reload()')
log()

log('方法 2: 手动清理')
log('----------------------------------------')
log('1. 打开应用')
log('2. 按 F12 打开开发者工具')
log('3. 切换到 Console 标签')
log('4. 粘贴以下代码并回车：')
log()
log("   localStorage.removeItem('pi-session-manager-badge-states')")
log("   console.log('✅ Badge 数据已清理')")
log('   location.reload()')
log()

log('方法 3: 清理所有 localStorage（慎用）')
log('----------------------------------------')
log('localStorage.clear()')
log('location.reload()')
log()

log('✅ 清理后的行为：')
log('  - 所有现有会话：无 badge')
log('  - 新创建的会话：绿色 NEW badge')
log('  - 更新的会话：蓝色 UPDATED badge')
log()

log('💡 提示：')
log('  - Badge 数据存储在浏览器 localStorage 中')
log('  - 清理后不影响会话数据本身')
log('  - 重启应用会自动建立新的基线')
