export interface TokenUsageLike {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
}

export interface SessionEntryLike {
  type?: string
  id?: string
  parentId?: string | null
  timestamp?: string
  message?: {
    role?: string
    provider?: string
    model?: string
    usage?: TokenUsageLike
  }
}

export interface CacheUsageTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  promptTotal: number
  tokenTotal: number
  assistantMessages: number
}

export interface CacheUsageMessageStat {
  id: string
  parentId?: string | null
  timestamp: string
  provider: string
  model: string
  sequence: number
  activeBranchSequence?: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  promptTotal: number
  tokenTotal: number
  hitRate: number
  isOnActiveBranch: boolean
}

export interface CacheUsageSeries {
  promptTotals: number[]
  hitRates: number[]
  cumulativeInput: number[]
  cumulativeCacheRead: number[]
  cumulativeCacheWrite: number[]
  cumulativeHitRates: number[]
}

export interface CacheUsageStats {
  assistantMessages: number
  overallHitRate: number
  totals: Omit<CacheUsageTotals, 'assistantMessages'>
  messages: CacheUsageMessageStat[]
  treeTotals: CacheUsageTotals
  activeBranchTotals: CacheUsageTotals
  treeHitRate: number
  activeBranchHitRate: number
  activeBranchMessages: CacheUsageMessageStat[]
  latestMessageId: string | null
  series: CacheUsageSeries
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function emptyTotals(): CacheUsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    promptTotal: 0,
    tokenTotal: 0,
    assistantMessages: 0,
  }
}

function addToTotals(totals: CacheUsageTotals, message: CacheUsageMessageStat) {
  totals.input += message.input
  totals.output += message.output
  totals.cacheRead += message.cacheRead
  totals.cacheWrite += message.cacheWrite
  totals.promptTotal += message.promptTotal
  totals.tokenTotal += message.tokenTotal
  totals.assistantMessages += 1
}

function buildActiveBranchIdSet(
  entries: SessionEntryLike[],
  activeEntryId?: string | null,
): { ids: Set<string>; latestMessageId: string | null } {
  const messageEntries = entries.filter((entry) => entry?.type === 'message' && typeof entry.id === 'string' && entry.id)
  const latestMessage = [...messageEntries].reverse().find((entry) => typeof entry.id === 'string' && entry.id) ?? null
  const seedId = activeEntryId || latestMessage?.id || null
  if (!seedId) {
    return { ids: new Set<string>(), latestMessageId: null }
  }

  const byId = new Map(messageEntries.map((entry) => [entry.id as string, entry]))
  const fallbackParentById = new Map<string, string | null>()
  let previousId: string | null = null

  for (const entry of messageEntries) {
    if (typeof entry.id !== 'string' || !entry.id) continue
    fallbackParentById.set(entry.id, previousId)
    previousId = entry.id
  }

  const ids = new Set<string>()
  let currentId: string | null = seedId

  while (currentId && !ids.has(currentId)) {
    ids.add(currentId)
    const current = byId.get(currentId)
    currentId = typeof current?.parentId === 'string' && current.parentId
      ? current.parentId
      : (fallbackParentById.get(currentId) ?? null)
  }

  return { ids, latestMessageId: seedId }
}

export function computeCacheHitPercent(input: number, cacheRead: number, cacheWrite: number): number {
  const denominator = input + cacheRead + cacheWrite
  if (denominator <= 0) return 0
  return (cacheRead / denominator) * 100
}

export function computeCumulativeSeries(messages: CacheUsageMessageStat[]): CacheUsageSeries {
  const promptTotals: number[] = []
  const hitRates: number[] = []
  const cumulativeInput: number[] = []
  const cumulativeCacheRead: number[] = []
  const cumulativeCacheWrite: number[] = []
  const cumulativeHitRates: number[] = []

  let input = 0
  let cacheRead = 0
  let cacheWrite = 0

  for (const message of messages) {
    promptTotals.push(message.promptTotal)
    hitRates.push(message.hitRate)

    input += message.input
    cacheRead += message.cacheRead
    cacheWrite += message.cacheWrite

    cumulativeInput.push(input)
    cumulativeCacheRead.push(cacheRead)
    cumulativeCacheWrite.push(cacheWrite)
    cumulativeHitRates.push(computeCacheHitPercent(input, cacheRead, cacheWrite))
  }

  return {
    promptTotals,
    hitRates,
    cumulativeInput,
    cumulativeCacheRead,
    cumulativeCacheWrite,
    cumulativeHitRates,
  }
}

export function collectCacheUsageStats(
  entries: SessionEntryLike[],
  options?: { activeEntryId?: string | null },
): CacheUsageStats {
  const { ids: activeBranchIds, latestMessageId } = buildActiveBranchIdSet(entries, options?.activeEntryId)
  const messages: CacheUsageMessageStat[] = []
  const treeTotals = emptyTotals()
  const activeBranchTotals = emptyTotals()
  let sequence = 0
  let activeBranchSequence = 0

  for (const entry of entries) {
    if (entry?.type !== 'message') continue
    if (entry?.message?.role !== 'assistant') continue
    if (!entry.message.usage) continue

    sequence += 1

    const input = asNumber(entry.message.usage.input)
    const output = asNumber(entry.message.usage.output)
    const cacheRead = asNumber(entry.message.usage.cacheRead)
    const cacheWrite = asNumber(entry.message.usage.cacheWrite)
    const promptTotal = input + cacheRead + cacheWrite
    const tokenTotal = promptTotal + output
    const hitRate = computeCacheHitPercent(input, cacheRead, cacheWrite)
    const isOnActiveBranch = Boolean(entry.id && activeBranchIds.has(entry.id))

    const message: CacheUsageMessageStat = {
      id: entry.id || `assistant-${sequence}`,
      parentId: entry.parentId,
      timestamp: entry.timestamp || '',
      provider: entry.message.provider || '',
      model: entry.message.model || '',
      sequence,
      activeBranchSequence: undefined,
      input,
      output,
      cacheRead,
      cacheWrite,
      promptTotal,
      tokenTotal,
      hitRate,
      isOnActiveBranch,
    }

    addToTotals(treeTotals, message)

    if (isOnActiveBranch) {
      activeBranchSequence += 1
      message.activeBranchSequence = activeBranchSequence
      addToTotals(activeBranchTotals, message)
    }

    messages.push(message)
  }

  const activeBranchMessages = messages.filter((message) => message.isOnActiveBranch)
  const treeHitRate = computeCacheHitPercent(treeTotals.input, treeTotals.cacheRead, treeTotals.cacheWrite)
  const activeBranchHitRate = computeCacheHitPercent(
    activeBranchTotals.input,
    activeBranchTotals.cacheRead,
    activeBranchTotals.cacheWrite,
  )

  return {
    assistantMessages: treeTotals.assistantMessages,
    overallHitRate: treeHitRate,
    totals: {
      input: treeTotals.input,
      output: treeTotals.output,
      cacheRead: treeTotals.cacheRead,
      cacheWrite: treeTotals.cacheWrite,
      promptTotal: treeTotals.promptTotal,
      tokenTotal: treeTotals.tokenTotal,
    },
    messages,
    treeTotals,
    activeBranchTotals,
    treeHitRate,
    activeBranchHitRate,
    activeBranchMessages,
    latestMessageId,
    series: computeCumulativeSeries(messages),
  }
}

export function formatPercent(value: number, locale = 'en-US'): string {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`
}

export function formatInt(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(Math.round(value))
}
