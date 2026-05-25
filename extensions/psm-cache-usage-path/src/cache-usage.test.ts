import { describe, expect, it } from 'vitest'

import { collectCacheUsageStats, computeCacheHitPercent } from './cache-usage'

describe('computeCacheHitPercent', () => {
  it('uses cacheRead / (input + cacheRead + cacheWrite)', () => {
    expect(computeCacheHitPercent(100, 300, 100)).toBe(60)
  })

  it('returns 0 when prompt token denominator is zero', () => {
    expect(computeCacheHitPercent(0, 0, 0)).toBe(0)
  })
})

describe('collectCacheUsageStats', () => {
  it('counts only assistant messages with usage and aggregates hit rate', () => {
    const stats = collectCacheUsageStats([
      {
        type: 'message',
        id: 'u1',
        timestamp: '2026-05-23T10:00:00Z',
        message: { role: 'user' },
      },
      {
        type: 'message',
        id: 'a1',
        timestamp: '2026-05-23T10:01:00Z',
        message: {
          role: 'assistant',
          model: 'claude-4',
          usage: { input: 100, output: 50, cacheRead: 300, cacheWrite: 100 },
        },
      },
      {
        type: 'message',
        id: 'a2',
        timestamp: '2026-05-23T10:02:00Z',
        message: {
          role: 'assistant',
          model: 'claude-4',
          usage: { input: 50, output: 25, cacheRead: 50, cacheWrite: 0 },
        },
      },
      {
        type: 'message',
        id: 'a3',
        timestamp: '2026-05-23T10:03:00Z',
        message: { role: 'assistant' },
      },
    ])

    expect(stats.assistantMessages).toBe(2)
    expect(stats.totals).toMatchObject({
      input: 150,
      output: 75,
      cacheRead: 350,
      cacheWrite: 100,
      promptTotal: 600,
      tokenTotal: 675,
    })
    expect(stats.totals.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
      knownMessages: 0,
      unknownMessages: 2,
    })
    expect(stats.overallHitRate).toBeCloseTo(58.333333, 5)
    expect(stats.messages.map((message) => ({ id: message.id, hitRate: message.hitRate }))).toEqual([
      { id: 'a1', hitRate: 60 },
      { id: 'a2', hitRate: 50 },
    ])

    expect(stats.treeTotals).toEqual({
      input: 150,
      output: 75,
      cacheRead: 350,
      cacheWrite: 100,
      promptTotal: 600,
      tokenTotal: 675,
      assistantMessages: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
        knownMessages: 0,
        unknownMessages: 2,
      },
    })
    expect(stats.activeBranchTotals).toEqual(stats.treeTotals)
    expect(stats.treeHitRate).toBeCloseTo(58.333333, 5)
    expect(stats.activeBranchHitRate).toBeCloseTo(58.333333, 5)
    expect(stats.activeBranchMessages.map((message) => message.id)).toEqual(['a1', 'a2'])
  })

  it('separates latest branch totals from whole tree totals using parentId lineage', () => {
    const entries = [
      {
        type: 'message',
        id: 'u1',
        timestamp: '2026-05-23T10:00:00Z',
        message: { role: 'user' },
      },
      {
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-05-23T10:01:00Z',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          model: 'claude-4',
          usage: { input: 100, output: 30, cacheRead: 100, cacheWrite: 0 },
        },
      },
      {
        type: 'message',
        id: 'u2',
        parentId: 'a1',
        timestamp: '2026-05-23T10:02:00Z',
        message: { role: 'user' },
      },
      {
        type: 'message',
        id: 'a2',
        parentId: 'u2',
        timestamp: '2026-05-23T10:03:00Z',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          model: 'claude-4',
          usage: { input: 50, output: 25, cacheRead: 0, cacheWrite: 50 },
        },
      },
      {
        type: 'message',
        id: 'u3',
        parentId: 'a1',
        timestamp: '2026-05-23T10:04:00Z',
        message: { role: 'user' },
      },
      {
        type: 'message',
        id: 'a3',
        parentId: 'u3',
        timestamp: '2026-05-23T10:05:00Z',
        message: {
          role: 'assistant',
          provider: 'openai',
          model: 'gpt-4.1',
          usage: { input: 20, output: 10, cacheRead: 80, cacheWrite: 0 },
        },
      },
    ]
    const stats = collectCacheUsageStats(entries)

    expect(stats.messages.map((message) => ({
      id: message.id,
      sequence: message.sequence,
      activeBranchSequence: message.activeBranchSequence,
      isOnActiveBranch: message.isOnActiveBranch,
    }))).toEqual([
      { id: 'a1', sequence: 1, activeBranchSequence: 1, isOnActiveBranch: true },
      { id: 'a2', sequence: 2, activeBranchSequence: undefined, isOnActiveBranch: false },
      { id: 'a3', sequence: 3, activeBranchSequence: 2, isOnActiveBranch: true },
    ])

    expect(stats.treeTotals).toEqual({
      input: 170,
      output: 65,
      cacheRead: 180,
      cacheWrite: 50,
      promptTotal: 400,
      tokenTotal: 465,
      assistantMessages: 3,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
        knownMessages: 0,
        unknownMessages: 3,
      },
    })
    expect(stats.activeBranchTotals).toEqual({
      input: 120,
      output: 40,
      cacheRead: 180,
      cacheWrite: 0,
      promptTotal: 300,
      tokenTotal: 340,
      assistantMessages: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
        knownMessages: 0,
        unknownMessages: 2,
      },
    })
    expect(stats.activeBranchMessages.map((message) => message.id)).toEqual(['a1', 'a3'])
    expect(stats.treeHitRate).toBeCloseTo(45, 5)
    expect(stats.activeBranchHitRate).toBeCloseTo(60, 5)

    const focusedStats = collectCacheUsageStats(entries, { activeEntryId: 'a2' })
    expect(focusedStats.activeBranchMessages.map((message) => message.id)).toEqual(['a1', 'a2'])
    expect(focusedStats.activeBranchHitRate).toBeCloseTo(33.333333, 5)
    expect(focusedStats.latestMessageId).toBe('a2')
  })

  it('tracks model switches, reason labels, and recorded cost coverage', () => {
    const stats = collectCacheUsageStats([
      {
        type: 'message',
        id: 'a1',
        timestamp: '2026-05-23T10:01:00Z',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          model: 'claude-4',
          usage: {
            input: 100,
            output: 20,
            cacheRead: 900,
            cacheWrite: 0,
            cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0, total: 0.31 },
          },
        },
      },
      {
        type: 'message',
        id: 'a2',
        parentId: 'a1',
        timestamp: '2026-05-23T10:02:00Z',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          model: 'claude-4',
          usage: { input: 100, output: 30, cacheRead: 0, cacheWrite: 2000, cost: 0.5 },
        },
      },
      {
        type: 'message',
        id: 'a3',
        parentId: 'a2',
        timestamp: '2026-05-23T10:03:00Z',
        message: {
          role: 'assistant',
          provider: 'openai',
          model: 'gpt-5',
          usage: { input: 200, output: 40, cacheRead: 0, cacheWrite: 1500 },
        },
      },
    ])

    expect(stats.modelSwitches).toHaveLength(1)
    expect(stats.modelSwitches[0]).toMatchObject({
      sequence: 3,
      fromLabel: 'anthropic/claude-4',
      toLabel: 'openai/gpt-5',
      costKnown: false,
    })

    expect(stats.messages.map((message) => ({
      id: message.id,
      modelChanged: message.modelChanged,
      cacheWriteSpike: message.cacheWriteSpike,
      costKnown: message.costKnown,
      reasons: message.reasons,
    }))).toEqual([
      { id: 'a1', modelChanged: false, cacheWriteSpike: false, costKnown: true, reasons: [] },
      {
        id: 'a2',
        modelChanged: false,
        cacheWriteSpike: true,
        costKnown: true,
        reasons: ['first-cache-write', 'cache-write-spike', 'hit-rate-drop'],
      },
      {
        id: 'a3',
        modelChanged: true,
        cacheWriteSpike: false,
        costKnown: false,
        reasons: ['model-switch', 'cost-unknown'],
      },
    ])

    expect(stats.treeTotals.cost).toEqual({
      input: 0.1,
      output: 0.2,
      cacheRead: 0.01,
      cacheWrite: 0,
      total: 0.81,
      knownMessages: 2,
      unknownMessages: 1,
    })
    expect(stats.modelStats.map((model) => ({
      key: model.key,
      assistantMessages: model.assistantMessages,
      switchesIn: model.switchesIn,
      cost: model.cost.total,
      unknownMessages: model.cost.unknownMessages,
    }))).toEqual([
      {
        key: 'anthropic:claude-4',
        assistantMessages: 2,
        switchesIn: 0,
        cost: 0.81,
        unknownMessages: 0,
      },
      {
        key: 'openai:gpt-5',
        assistantMessages: 1,
        switchesIn: 1,
        cost: 0,
        unknownMessages: 1,
      },
    ])
    expect(stats.insights.map((insight) => insight.kind)).toEqual([
      'model-switch',
      'hit-rate-drop',
      'cache-write-spike',
      'cost-missing',
      'high-cost',
    ])
  })
})
