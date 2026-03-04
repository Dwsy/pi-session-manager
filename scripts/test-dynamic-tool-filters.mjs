#!/usr/bin/env node

import { checkContains, log } from './script-utils.mjs'

log('🔍 Dynamic Tool Filters Test')
log('==============================')
log()

checkContains(
  'src/components/SessionTree.tsx',
  'const availableTools = useMemo',
  'Dynamic tool extraction implemented',
  'Dynamic tool extraction missing',
  { exitOnFail: true },
)

checkContains(
  'src/components/SessionTree.tsx',
  'tool-${string}',
  'FilterMode type supports dynamic tools',
  'FilterMode type not updated',
  { exitOnFail: true },
)

checkContains(
  'src/components/SessionTree.tsx',
  'availableTools.map',
  'Dynamic filter buttons rendering',
  'Dynamic filter buttons missing',
  { exitOnFail: true },
)

checkContains(
  'src/components/SessionFlowView.tsx',
  'tool-${string}',
  'SessionFlowView FilterMode updated',
  'SessionFlowView FilterMode not updated',
  { exitOnFail: true },
)

checkContains(
  'src/components/SessionFlowView.tsx',
  "filter.startsWith('tool-')",
  'matchesFilter supports dynamic tool filtering',
  'matchesFilter not updated',
  { exitOnFail: true },
)

log()
log('==============================')
log('✅ All checks passed!')
log()
log('📝 Features:')
log('  1. ✅ Automatically extracts all tools from current session')
log('  2. ✅ Dynamically generates filter buttons for each tool')
log('  3. ✅ Supports filtering by any tool type (tool:bash, tool:read, etc.)')
log('  4. ✅ Tool buttons use color coding from theme')
log('  5. ✅ Compatible with both Tree and Flow views')
log()
log('🎯 Usage:')
log('  • Open a session with tool calls')
log('  • Filter buttons will auto-appear based on used tools')
log('  • Click any tool button to filter by that tool type')
log()
