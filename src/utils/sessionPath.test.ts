import { describe, expect, it } from 'vitest'

import { sessionPathMatches } from './sessionPath'

describe('sessionPathMatches', () => {
  it('matches exact absolute path', () => {
    expect(sessionPathMatches('/tmp/a/session.jsonl', '/tmp/a/session.jsonl')).toBe(true)
  })

  it('does not match different absolute paths with same file name', () => {
    expect(sessionPathMatches('/tmp/proj-a/session.jsonl', '/tmp/proj-b/session.jsonl')).toBe(false)
  })

  it('keeps compatibility for short filename fallback', () => {
    expect(sessionPathMatches('/tmp/proj-a/session.jsonl', 'session.jsonl')).toBe(true)
  })

  it('matches windows path ignoring case', () => {
    expect(sessionPathMatches('C:/Users/Dev/Sessions/ABC.JSONL', 'c:/users/dev/sessions/abc.jsonl')).toBe(true)
  })
})
