#!/usr/bin/env node

import { checkContains, log, resolveFromRoot, runCapture, runChecked } from './script-utils.mjs'

log('=== Flow View Enhancements Test ===')
log()

log('Test 1: Checking zoom_hotkeys_enabled default value...')
checkContains(
  'src-tauri/src/main.rs',
  'zoom_hotkeys_enabled(false)',
  'PASS: Zoom hotkeys disabled by default',
  'FAIL: Zoom hotkeys should be disabled by default',
  { exitOnFail: true },
)
log()

log('Test 2: Checking MiniMap draggable property...')
checkContains(
  'src/components/SessionFlowView.tsx',
  'draggable',
  'PASS: MiniMap is draggable',
  'FAIL: MiniMap should be draggable',
  { exitOnFail: true },
)
log()

log('Test 3: Checking MiniMap pannable/zoomable properties...')
const hasPannable = checkContains(
  'src/components/SessionFlowView.tsx',
  'pannable={true}',
  'PASS: MiniMap is pannable',
  'FAIL: MiniMap should be pannable',
)
const hasZoomable = checkContains(
  'src/components/SessionFlowView.tsx',
  'zoomable={true}',
  'PASS: MiniMap is zoomable',
  'FAIL: MiniMap should be zoomable',
)
if (!hasPannable || !hasZoomable) process.exit(1)
log()

log('Test 4: Checking hierarchy view mode...')
checkContains(
  'src/components/SessionTree.tsx',
  "'hierarchy'",
  'PASS: Hierarchy view mode exists',
  'FAIL: Hierarchy view mode should exist',
  { exitOnFail: true },
)
log()

log('Test 5: Checking view mode toggle in toolbar...')
const hasGitBranch = checkContains(
  'src/components/SessionFlowView.tsx',
  'GitBranch',
  'PASS: GitBranch icon exists',
  'FAIL: View mode toggle should include GitBranch',
)
const hasList = checkContains(
  'src/components/SessionFlowView.tsx',
  'List',
  'PASS: List icon exists',
  'FAIL: View mode toggle should include List',
)
if (!hasGitBranch || !hasList) process.exit(1)
log()

log('Test 6: Checking MiniMap CSS enhancements...')
checkContains(
  'src/styles/flow.css',
  'cursor: move',
  'PASS: MiniMap has cursor: move style',
  'FAIL: MiniMap should have cursor: move style',
  { exitOnFail: true },
)
log()

log('Test 7: Running TypeScript compilation...')
const tscResult = runCapture('npx', ['tsc', '--noEmit'])
if (tscResult.status !== 0 || /error TS/i.test(`${tscResult.stdout}\n${tscResult.stderr}`)) {
  log('✗ FAIL: TypeScript compilation errors found')
  runChecked('npx', ['tsc', '--noEmit'])
  process.exit(1)
}
log('✓ PASS: TypeScript compilation successful')
log()

log('Test 8: Running Rust compilation check...')
const rustQuiet = runCapture('cargo', ['check', '--quiet'], { cwd: resolveFromRoot('src-tauri') })
if (rustQuiet.status !== 0) {
  log('✗ FAIL: Rust compilation errors found')
  runChecked('cargo', ['check'], { cwd: resolveFromRoot('src-tauri') })
  process.exit(1)
}
log('✓ PASS: Rust compilation successful')
log()

log('=== All Tests Passed ===')
log()
log('Summary of enhancements:')
log('  1. ✓ Zoom hotkeys disabled by default (prevents accidental pinch zoom)')
log('  2. ✓ Interactive MiniMap with draggable viewport')
log('  3. ✓ MiniMap supports pannable and zoomable')
log('  4. ✓ Hierarchy view mode for parent-child relationships')
log('  5. ✓ View mode toggle in toolbar (Flow ↔ Hierarchy)')
log('  6. ✓ Enhanced CSS styling for MiniMap')
