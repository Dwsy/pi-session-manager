#!/usr/bin/env node

import { appendFile, readdir } from 'node:fs/promises'
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

async function findFirstJsonl(dir, excludedPrefix) {
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (!full.startsWith(excludedPrefix)) {
          stack.push(full)
        }
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.jsonl') && !full.startsWith(excludedPrefix)) {
        return full
      }
    }
  }
  return null
}

function toUtcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

async function main() {
  log('=== Badge 功能测试 ===')
  log()

  const sessionsDir = join(userHome(), '.pi', 'agent', 'sessions')
  const testDir = join(sessionsDir, '--test-badge--')

  log('📋 测试步骤：')
  log('1. 启动应用后，所有现有会话不应该有 Badge')
  log('2. 创建新会话，应该显示绿色 NEW badge')
  log('3. 更新现有会话，应该显示蓝色 UPDATED badge')
  log('4. 点击会话后，badge 应该消失')
  log()

  log('⏳ 等待 3 秒，确保应用已启动...')
  await sleep(3000)
  log()

  log('🆕 测试 1: 创建新会话（应该显示绿色 NEW badge）')
  await ensureDir(testDir)
  const testFile = join(testDir, `${timestampForFilename()}-000Z_test-new-${randomId()}.jsonl`)
  const newSessionContent = [
    '{"type":"session","id":"test-new-badge","timestamp":"2026-01-31T18:00:00Z","cwd":"/tmp/test"}',
    '{"type":"message","id":"msg1","parentId":null,"timestamp":"2026-01-31T18:00:01Z","message":{"role":"user","content":[{"type":"text","text":"测试 NEW badge"}]}}',
    '{"type":"message","id":"msg2","parentId":"msg1","timestamp":"2026-01-31T18:00:02Z","message":{"role":"assistant","content":[{"type":"text","text":"这个会话应该显示绿色 NEW badge"}]}}',
    '{"type":"session_info","id":"info1","parentId":null,"timestamp":"2026-01-31T18:00:03Z","name":"测试 NEW Badge"}',
    '',
  ].join('\n')
  await writeTextFile(testFile, newSessionContent)

  log(`✅ 新会话已创建: ${testFile}`)
  log('   👀 请检查应用：应该看到绿色 NEW badge')
  log()

  log('⏳ 等待 5 秒...')
  await sleep(5000)
  log()

  log('🔄 测试 2: 更新现有会话（应该显示蓝色 UPDATED badge）')
  log('   找一个现有会话并添加新消息...')
  const existingSession = await findFirstJsonl(sessionsDir, testDir)
  if (existingSession) {
    log(`   更新会话: ${existingSession}`)
    const updateLine = `{"type":"message","id":"msg-test-${Math.floor(Date.now() / 1000)}","parentId":null,"timestamp":"${toUtcTimestamp()}","message":{"role":"user","content":[{"type":"text","text":"测试 UPDATED badge - 这是新添加的消息"}]}}\n`
    await appendFile(existingSession, updateLine, 'utf8')
    log('✅ 会话已更新')
    log('   👀 请检查应用：应该看到蓝色 UPDATED badge')
  } else {
    log('⚠️  没有找到现有会话，跳过更新测试')
  }

  log()
  log('⏳ 等待 5 秒后清理...')
  await sleep(5000)
  log()

  log('🧹 清理测试文件...')
  await removePath(testFile)
  await removePath(testDir)
  log('✅ 测试完成！')
  log()
  log('📝 验收标准：')
  log('  ✅ 启动时现有会话无 badge')
  log('  ✅ 新会话显示绿色 NEW badge')
  log('  ✅ 更新会话显示蓝色 UPDATED badge')
  log('  ✅ 点击会话后 badge 消失')
  log('  ✅ Badge 在 24 小时后自动过期')
}

main().catch((error) => {
  console.error(`❌ 执行失败: ${error.message}`)
  process.exit(1)
})
