#!/usr/bin/env node

import { log, runChecked } from './script-utils.mjs'

log('=========================================')
log('  Subagent Cost Feature Test Suite')
log('=========================================')
log()

log('📦 Running unit tests in subagent.rs...')
runChecked('cargo', ['test', '--package', 'pi-session-manager', '--lib', 'subagent::tests', '--quiet'])

log()
log('📦 Running integration tests (subagent_cost_test.rs)...')
runChecked('cargo', ['test', '--package', 'pi-session-manager', '--test', 'subagent_cost_test', '--', '--nocapture'])

log()
log('📦 Running stats tests...')
runChecked('cargo', ['test', '--package', 'pi-session-manager', '--lib', 'stats::tests', '--quiet'])

log()
log('=========================================')
log('  ✅ All tests passed!')
log('=========================================')
log()
log('Test Coverage:')
log('  ✓ Single meta.json parsing')
log('  ✓ Multiple runs aggregation')
log('  ✓ Directory scanning')
log('  ✓ File modification detection')
log('  ✓ Full integration scanning')
log('  ✓ Empty directory handling')
log('  ✓ Multiple session directories')
log('  ✓ Malformed JSON graceful handling')
log()
log('To run frontend tests:')
log('  npm run test')
log()
