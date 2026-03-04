#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  commandExists,
  formatFileSize,
  log,
  nowUnixSeconds,
  openFileInSystem,
  runCapture,
} from './script-utils.mjs'

const sessionPath =
  '/Users/dengwenyu/.pi/agent/sessions/--private-tmp-checkpoint-v2-test--/2026-01-27T05-48-33-581Z_a4179077-31ae-4c3d-b25f-85deda4672dc.jsonl'
const outputPath = join(tmpdir(), `test-export-${nowUnixSeconds()}.html`)

log('Testing HTML export...')
log(`Session: ${sessionPath}`)
log(`Output: ${outputPath}`)

if (!commandExists('pi')) {
  log('❌ Export failed! `pi` command not found')
  process.exit(1)
}

const exportResult = runCapture('pi', ['--export', sessionPath, outputPath])
if (exportResult.status === 0 && existsSync(outputPath)) {
  log('✅ Export successful!')
  log(`File size: ${formatFileSize(statSync(outputPath).size)}`)
  log('Opening in browser...')
  openFileInSystem(outputPath)
} else {
  log('❌ Export failed!')
  process.stderr.write(exportResult.stderr || exportResult.stdout)
  process.exit(1)
}
