import { describe, expect, it } from 'vitest'

import { buildSessionEntries } from './content'
import { DEMO_SESSION_SEEDS } from './seed'
import { buildSessionBranchModel } from '@/utils/session-branch'

describe('demo session content', () => {
  it('keeps the session tree sample as explicit v3 branches', () => {
    const seed = DEMO_SESSION_SEEDS.find((item) => item.id === 'demo-033')
    expect(seed).toBeDefined()

    const entries = buildSessionEntries(seed!)
    expect(entries[0]).toMatchObject({ type: 'session', version: 3 })

    const model = buildSessionBranchModel(entries)
    expect(model.forks).toHaveLength(1)
    expect(model.forks[0]?.children).toHaveLength(4)
  })
})
