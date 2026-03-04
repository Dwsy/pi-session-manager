#!/usr/bin/env node

import { checkContains, checkFiles, log, runCapture } from './script-utils.mjs'

log('🚀 Dashboard 性能优化测试')
log('================================')
log()

log('📦 1. 检查 Rust 代码编译...')
const rustCheck = runCapture('cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml'])
const rustLog = `${rustCheck.stdout}\n${rustCheck.stderr}`
const rustMatches = rustLog
  .split('\n')
  .filter((line) => /\b(Finished|error)\b/i.test(line))
if (rustMatches.length > 0) {
  rustMatches.forEach((line) => line.trim() && log(line))
} else {
  log('✅ Rust 代码编译通过')
}
log()

log('📝 2. 检查 TypeScript 类型...')
const tscCheck = runCapture('npx', ['tsc', '--noEmit'])
const tscLog = `${tscCheck.stdout}\n${tscCheck.stderr}`
if (/Dashboard\.tsx.*error/i.test(tscLog)) {
  log('❌ Dashboard.tsx 有类型错误')
} else {
  log('✅ Dashboard.tsx 类型检查通过')
}
log()

log('📂 3. 检查关键文件...')
checkFiles([
  'src/components/Dashboard.tsx',
  'src-tauri/src/stats.rs',
  'src-tauri/Cargo.toml',
  'docs/pr/20260131-dashboard-performance-optimization.md',
])
log()

log('🔍 4. 检查 Rayon 依赖...')
checkContains('src-tauri/Cargo.toml', 'rayon', 'Rayon 依赖已添加', 'Rayon 依赖缺失')
log()

log('⚡ 5. 检查并行处理代码...')
checkContains('src-tauri/src/stats.rs', 'par_iter', '并行处理代码已添加', '并行处理代码缺失')
log()

log('🎨 6. 检查前端优化...')
checkContains(
  'src/components/Dashboard.tsx',
  '立即显示基础统计',
  '前端非阻塞加载已实现',
  '前端非阻塞加载缺失',
)
log()

log('📊 7. 性能测试建议')
log('================================')
log()
log('请手动执行以下测试：')
log()
log('1. 启动应用：')
log('   npm run tauri:dev')
log()
log('2. 观察首页加载：')
log('   - 是否立即显示基础统计？')
log('   - 是否不再显示阻塞式加载？')
log('   - 详细统计加载时间是多少？')
log()
log('3. 测试刷新功能：')
log('   - 点击刷新按钮')
log('   - 观察刷新图标动画')
log('   - 确认按钮被禁用（防止重复点击）')
log()
log('4. 测试空数据：')
log('   - 切换到没有 sessions 的项目')
log("   - 确认显示'没有数据'提示")
log()
log('5. 性能对比：')
log('   - 记录优化前后的加载时间')
log('   - 对比用户体验改善')
log()
log('================================')
log('✅ 测试脚本执行完成')
