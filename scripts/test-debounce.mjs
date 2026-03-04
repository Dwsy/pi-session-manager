#!/usr/bin/env node

import { join } from 'node:path'
import {
  ensureDir,
  log,
  randomId,
  removePath,
  sleep,
  timestampForFilename,
  userHome,
  writeTextFile,
} from './script-utils.mjs'

async function main() {
  log('=== 测试防抖机制 ===')
  log()
  log('📋 测试场景：')
  log('  1. 快速创建 3 个文件（间隔 0.5 秒）')
  log('  2. 后端会触发 3 次事件')
  log('  3. 前端应该只刷新 1 次（2 秒防抖）')
  log()

  const sessionsDir = join(userHome(), '.pi', 'agent', 'sessions')
  const testDir = join(sessionsDir, '--test-debounce--')
  await ensureDir(testDir)

  log('⏳ 等待 3 秒让应用启动...')
  await sleep(3000)
  log()
  log('🚀 开始测试...')
  log()

  for (let i = 1; i <= 3; i += 1) {
    const filePath = join(
      testDir,
      `${timestampForFilename()}-000Z_test-${i}-${randomId()}.jsonl`,
    )
    const content = [
      `{"type":"session","id":"test-debounce-${i}","timestamp":"2026-01-31T18:00:00Z","cwd":"/tmp/test"}`,
      `{"type":"message","id":"msg1","parentId":null,"timestamp":"2026-01-31T18:00:01Z","message":{"role":"user","content":[{"type":"text","text":"测试防抖 ${i}"}]}}`,
      `{"type":"session_info","id":"info1","parentId":null,"timestamp":"2026-01-31T18:00:03Z","name":"测试防抖 ${i}"}`,
      '',
    ].join('\n')
    await writeTextFile(filePath, content)
    log(`✅ 创建文件 ${i}: ${filePath}`)
    await sleep(500)
  }

  log()
  log('📊 预期结果：')
  log("  - 后端日志：应该看到 3 次 'Detected .jsonl file changes'")
  log("  - 前端日志：应该看到 3 次 '[FileWatcher] 🔔 Event received'")
  log("  - 前端日志：应该看到 2 次 '[FileWatcher] ⏱️ Clearing previous debounce timer'")
  log("  - 前端日志：应该只看到 1 次 '[FileWatcher] ✅ Debounce timer fired'")
  log("  - 前端日志：应该只看到 1 次 '[App] 📡 File watcher triggered'")
  log('  - 会话列表：应该只刷新 1 次')
  log()

  log('⏳ 等待 5 秒观察结果...')
  await sleep(5000)
  log()

  log('🧹 清理测试文件...')
  await removePath(testDir)
  log('✅ 测试完成！')
}

main().catch((error) => {
  console.error(`❌ 执行失败: ${error.message}`)
  process.exit(1)
})
