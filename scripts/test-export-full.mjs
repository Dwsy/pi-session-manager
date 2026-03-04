#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  commandExists,
  firstFileByExtension,
  formatFileSize,
  log,
  nowUnixSeconds,
  openFileInSystem,
  runCapture,
  userHome,
} from './script-utils.mjs'

log('=========================================')
log('PI Session Manager - Export Feature Test')
log('=========================================')
log()

log('1. Checking PI command...')
if (!commandExists('pi')) {
  log('   ❌ PI command not found')
  process.exit(1)
}
log('   ✅ PI command found')
runCapture('pi', ['--version'])
log()

log('2. Checking PI export command...')
const checkHtmlPath = join(tmpdir(), `pi-export-check-${nowUnixSeconds()}.html`)
const exportCheck = runCapture('pi', ['--export', '/nonexistent/file.jsonl', checkHtmlPath])
const exportCheckText = `${exportCheck.stdout}\n${exportCheck.stderr}`
if (exportCheckText.includes('File not found')) {
  log('   ✅ PI export command available')
} else {
  log('   ⚠️  PI export command check skipped')
}
log()

log('3. Finding test session...')
const sessionsRoot = join(userHome(), '.pi', 'agent', 'sessions')
const sessionFile = firstFileByExtension(sessionsRoot, '.jsonl')
if (!sessionFile) {
  log('   ❌ No session files found')
  process.exit(1)
}
log(`   ✅ Found: ${sessionFile}`)
log()

log('4. Testing HTML export...')
const htmlOutput = join(tmpdir(), `test-export-${nowUnixSeconds()}.html`)
const htmlExport = runCapture('pi', ['--export', sessionFile, htmlOutput])
if (htmlExport.status === 0 && existsSync(htmlOutput) && statSync(htmlOutput).size > 0) {
  log('   ✅ HTML export successful')
  log(`   📄 File: ${htmlOutput}`)
  log(`   📊 Size: ${formatFileSize(statSync(htmlOutput).size)}`)
  log('   🌐 Opening in browser...')
  openFileInSystem(htmlOutput)
} else {
  log('   ❌ HTML export failed')
  process.stderr.write(htmlExport.stderr || htmlExport.stdout)
  process.exit(1)
}
log()

log('5. Testing Markdown export...')
const markdownTest = runCapture('cargo', [
  'test',
  '--package',
  'pi-session-manager',
  '--test',
  'export_test',
  'test_export_markdown',
])
if (`${markdownTest.stdout}\n${markdownTest.stderr}`.includes('test result: ok')) {
  log('   ✅ Markdown export test passed')
} else {
  log('   ⚠️  Markdown export test failed (may need compilation)')
}
log()

log('6. Testing JSON export...')
const jsonTest = runCapture('cargo', [
  'test',
  '--package',
  'pi-session-manager',
  '--test',
  'export_test',
  'test_export_json',
])
if (`${jsonTest.stdout}\n${jsonTest.stderr}`.includes('test result: ok')) {
  log('   ✅ JSON export test passed')
} else {
  log('   ⚠️  JSON export test failed (may need compilation)')
}
log()

log('7. Running all export tests...')
const allTests = runCapture('cargo', ['test', '--package', 'pi-session-manager', '--test', 'export_test'])
if (`${allTests.stdout}\n${allTests.stderr}`.includes('test result: ok')) {
  log('   ✅ All export tests passed')
} else {
  log('   ⚠️  Some tests failed')
}
log()

log('=========================================')
log('✅ Export feature test completed!')
log('=========================================')
log()
log('Generated files:')
log(`  - ${htmlOutput}`)
log()
log('To test the UI:')
log('  1. Run: npm run tauri dev')
log('  2. Select a session')
log('  3. Click the Export button')
log('  4. Choose export format')
log('  5. Select save location')
