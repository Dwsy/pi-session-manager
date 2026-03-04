#!/usr/bin/env node

import { basename, join } from 'node:path'
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
  log('=== 文件监听自动刷新测试 ===')
  log()

  const sessionsDir = join(userHome(), '.pi', 'agent', 'sessions')
  const testDir = join(sessionsDir, '--test-auto-refresh--')
  const testFile = join(testDir, `${timestampForFilename()}-000Z_test-${randomId()}.jsonl`)

  log('1. 创建测试目录...')
  await ensureDir(testDir)

  log('2. 创建测试会话文件...')
  const content = [
    '{"type":"session","id":"test-auto-refresh","timestamp":"2026-01-31T15:30:00Z","cwd":"/tmp/test"}',
    '{"type":"message","id":"msg1","parentId":null,"timestamp":"2026-01-31T15:30:01Z","message":{"role":"user","content":[{"type":"text","text":"测试自动刷新功能"}]}}',
    '{"type":"message","id":"msg2","parentId":"msg1","timestamp":"2026-01-31T15:30:02Z","message":{"role":"assistant","content":[{"type":"text","text":"文件监听正常工作！"}]}}',
    '{"type":"session_info","id":"info1","parentId":null,"timestamp":"2026-01-31T15:30:03Z","name":"测试自动刷新"}',
    '',
  ].join('\n')
  await writeTextFile(testFile, content)

  log(`✅ 测试文件已创建: ${testFile}`)
  log()
  log('📋 请检查应用界面：')
  log('   1. 会话列表应该自动刷新')
  log("   2. 应该看到新会话 '测试自动刷新'")
  log('   3. 无需手动按 Cmd+R')
  log()
  log('⏳ 等待 5 秒后自动清理...')
  await sleep(5000)

  log()
  log('3. 清理测试文件...')
  await removePath(testFile)
  const dirName = basename(testDir)
  await removePath(join(sessionsDir, dirName))

  log('✅ 测试完成！')
  log()
  log('💡 提示：')
  log('   - 如果看到新会话出现，说明文件监听工作正常')
  log('   - 如果没有自动刷新，请检查控制台日志')
  log("   - 查看后端日志: 搜索 '[FileWatcher]' 或 'File watcher'")
}

main().catch((error) => {
  console.error(`❌ 执行失败: ${error.message}`)
  process.exit(1)
})
