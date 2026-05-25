export interface TokenUsageLike {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  cost?: number | TokenCostLike
}

export interface TokenCostLike {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  total?: number
  input_cost?: number
  output_cost?: number
  cache_read?: number
  cache_write?: number
  cache_read_cost?: number
  cache_write_cost?: number
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
  cost: CacheUsageCostTotals
}

export interface CacheUsageCostTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  knownMessages: number
  unknownMessages: number
}

export type CacheUsageReason =
  | 'model-switch'
  | 'first-cache-write'
  | 'cache-write-spike'
  | 'hit-rate-drop'
  | 'cost-unknown'

export type CacheUsageInsightKind =
  | 'model-switch'
  | 'hit-rate-drop'
  | 'cache-write-spike'
  | 'first-cache-write'
  | 'branch-gap'
  | 'cost-missing'
  | 'high-cost'

export interface CacheUsageInsight {
  id: string
  kind: CacheUsageInsightKind
  severity: 'info' | 'warning' | 'success'
  sequence?: number
  model?: string
  previousModel?: string
  hitRate?: number
  previousHitRate?: number
  hitRateDelta?: number
  cacheWrite?: number
  cost?: number
  costKnown?: boolean
  count?: number
  unknownCount?: number
  totalCount?: number
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
  hitRateDelta: number
  providerModelKey: string
  previousProviderModelKey?: string
  previousProviderModelLabel?: string
  modelChanged: boolean
  cacheWriteSpike: boolean
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
  costKnown: boolean
  reasons: CacheUsageReason[]
  isOnActiveBranch: boolean
}

export interface CacheUsageModelStat {
  key: string
  provider: string
  model: string
  label: string
  assistantMessages: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  promptTotal: number
  tokenTotal: number
  hitRate: number
  cost: CacheUsageCostTotals
  switchesIn: number
  firstSequence: number
  lastSequence: number
}

export interface CacheUsageModelSwitch {
  id: string
  sequence: number
  timestamp: string
  fromKey: string
  fromLabel: string
  toKey: string
  toLabel: string
  hitRateBefore: number
  hitRateAfter: number
  hitRateDelta: number
  cacheWriteAfter: number
  costAfter: number
  costKnown: boolean
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
  modelStats: CacheUsageModelStat[]
  modelSwitches: CacheUsageModelSwitch[]
  insights: CacheUsageInsight[]
}

const CACHE_WRITE_SPIKE_MIN_TOKENS = 1000
const HIT_RATE_DROP_THRESHOLD = -20
const BRANCH_GAP_THRESHOLD = 15

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readCostNumber(cost: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = optionalNumber(cost[key])
    if (value !== undefined) return value
  }
  return 0
}

function emptyCostTotals(): CacheUsageCostTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    knownMessages: 0,
    unknownMessages: 0,
  }
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
    cost: emptyCostTotals(),
  }
}

function parseCost(value: unknown): CacheUsageMessageStat['cost'] & { known: boolean } {
  if (value === undefined || value === null) {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, known: false }
  }

  if (typeof value === 'number') {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: asNumber(value), known: true }
  }

  if (typeof value !== 'object') {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, known: false }
  }

  const cost = value as Record<string, unknown>
  const input = readCostNumber(cost, ['input', 'input_cost'])
  const output = readCostNumber(cost, ['output', 'output_cost'])
  const cacheRead = readCostNumber(cost, ['cacheRead', 'cache_read', 'cache_read_cost'])
  const cacheWrite = readCostNumber(cost, ['cacheWrite', 'cache_write', 'cache_write_cost'])
  const explicitTotal = optionalNumber(cost.total)
  const componentTotal = input + output + cacheRead + cacheWrite
  const total = explicitTotal !== undefined && (explicitTotal !== 0 || componentTotal === 0)
    ? explicitTotal
    : componentTotal

  return { input, output, cacheRead, cacheWrite, total, known: true }
}

function addCost(target: CacheUsageCostTotals, cost: CacheUsageMessageStat['cost'], known: boolean) {
  if (!known) {
    target.unknownMessages += 1
    return
  }

  target.input += cost.input
  target.output += cost.output
  target.cacheRead += cost.cacheRead
  target.cacheWrite += cost.cacheWrite
  target.total += cost.total
  target.knownMessages += 1
}

function addToTotals(totals: CacheUsageTotals, message: CacheUsageMessageStat) {
  totals.input += message.input
  totals.output += message.output
  totals.cacheRead += message.cacheRead
  totals.cacheWrite += message.cacheWrite
  totals.promptTotal += message.promptTotal
  totals.tokenTotal += message.tokenTotal
  totals.assistantMessages += 1
  addCost(totals.cost, message.cost, message.costKnown)
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

function providerModelKey(provider: string, model: string): string {
  return `${provider || 'unknown'}:${model || 'unknown'}`
}

function providerModelLabel(provider: string, model: string): string {
  if (provider && model) return `${provider}/${model}`
  return model || provider || 'unknown'
}

function isCacheWriteSpike(cacheWrite: number, previous?: CacheUsageMessageStat): boolean {
  if (cacheWrite < CACHE_WRITE_SPIKE_MIN_TOKENS) return false
  if (!previous) return true
  return previous.cacheWrite <= 0 || cacheWrite >= previous.cacheWrite * 2
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
  const modelStatsByKey = new Map<string, CacheUsageModelStat>()
  const modelSwitches: CacheUsageModelSwitch[] = []
  let sequence = 0
  let activeBranchSequence = 0
  let previousMessage: CacheUsageMessageStat | undefined
  let hadCacheWrite = false

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
    const cost = parseCost(entry.message.usage.cost)
    const isOnActiveBranch = Boolean(entry.id && activeBranchIds.has(entry.id))
    const provider = entry.message.provider || ''
    const model = entry.message.model || ''
    const currentProviderModelKey = providerModelKey(provider, model)
    const modelChanged = Boolean(previousMessage && previousMessage.providerModelKey !== currentProviderModelKey)
    const hitRateDelta = previousMessage ? hitRate - previousMessage.hitRate : 0
    const cacheWriteSpike = isCacheWriteSpike(cacheWrite, previousMessage)
    const reasons: CacheUsageReason[] = []

    if (modelChanged) reasons.push('model-switch')
    if (!hadCacheWrite && cacheWrite > 0) reasons.push('first-cache-write')
    if (cacheWriteSpike) reasons.push('cache-write-spike')
    if (hitRateDelta <= HIT_RATE_DROP_THRESHOLD) reasons.push('hit-rate-drop')
    if (!cost.known) reasons.push('cost-unknown')

    const message: CacheUsageMessageStat = {
      id: entry.id || `assistant-${sequence}`,
      parentId: entry.parentId,
      timestamp: entry.timestamp || '',
      provider,
      model,
      sequence,
      activeBranchSequence: undefined,
      input,
      output,
      cacheRead,
      cacheWrite,
      promptTotal,
      tokenTotal,
      hitRate,
      hitRateDelta,
      providerModelKey: currentProviderModelKey,
      previousProviderModelKey: previousMessage?.providerModelKey,
      previousProviderModelLabel: previousMessage ? providerModelLabel(previousMessage.provider, previousMessage.model) : undefined,
      modelChanged,
      cacheWriteSpike,
      cost: {
        input: cost.input,
        output: cost.output,
        cacheRead: cost.cacheRead,
        cacheWrite: cost.cacheWrite,
        total: cost.total,
      },
      costKnown: cost.known,
      reasons,
      isOnActiveBranch,
    }

    addToTotals(treeTotals, message)

    if (isOnActiveBranch) {
      activeBranchSequence += 1
      message.activeBranchSequence = activeBranchSequence
      addToTotals(activeBranchTotals, message)
    }

    let modelStat = modelStatsByKey.get(currentProviderModelKey)
    if (!modelStat) {
      modelStat = {
        key: currentProviderModelKey,
        provider,
        model,
        label: providerModelLabel(provider, model),
        assistantMessages: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        promptTotal: 0,
        tokenTotal: 0,
        hitRate: 0,
        cost: emptyCostTotals(),
        switchesIn: 0,
        firstSequence: sequence,
        lastSequence: sequence,
      }
      modelStatsByKey.set(currentProviderModelKey, modelStat)
    }

    modelStat.assistantMessages += 1
    modelStat.input += input
    modelStat.output += output
    modelStat.cacheRead += cacheRead
    modelStat.cacheWrite += cacheWrite
    modelStat.promptTotal += promptTotal
    modelStat.tokenTotal += tokenTotal
    modelStat.lastSequence = sequence
    addCost(modelStat.cost, message.cost, message.costKnown)
    if (modelChanged) {
      modelStat.switchesIn += 1
      modelSwitches.push({
        id: `switch-${message.id}`,
        sequence,
        timestamp: message.timestamp,
        fromKey: previousMessage!.providerModelKey,
        fromLabel: providerModelLabel(previousMessage!.provider, previousMessage!.model),
        toKey: currentProviderModelKey,
        toLabel: modelStat.label,
        hitRateBefore: previousMessage!.hitRate,
        hitRateAfter: hitRate,
        hitRateDelta,
        cacheWriteAfter: cacheWrite,
        costAfter: message.cost.total,
        costKnown: message.costKnown,
        isOnActiveBranch,
      })
    }

    messages.push(message)
    previousMessage = message
    if (cacheWrite > 0) hadCacheWrite = true
  }

  const activeBranchMessages = messages.filter((message) => message.isOnActiveBranch)
  const treeHitRate = computeCacheHitPercent(treeTotals.input, treeTotals.cacheRead, treeTotals.cacheWrite)
  const activeBranchHitRate = computeCacheHitPercent(
    activeBranchTotals.input,
    activeBranchTotals.cacheRead,
    activeBranchTotals.cacheWrite,
  )
  const modelStats = [...modelStatsByKey.values()]
    .map((modelStat) => ({
      ...modelStat,
      hitRate: computeCacheHitPercent(modelStat.input, modelStat.cacheRead, modelStat.cacheWrite),
    }))
    .sort((a, b) => b.promptTotal - a.promptTotal)
  const statsWithoutInsights = {
    assistantMessages: treeTotals.assistantMessages,
    overallHitRate: treeHitRate,
    totals: {
      input: treeTotals.input,
      output: treeTotals.output,
      cacheRead: treeTotals.cacheRead,
      cacheWrite: treeTotals.cacheWrite,
      promptTotal: treeTotals.promptTotal,
      tokenTotal: treeTotals.tokenTotal,
      cost: treeTotals.cost,
    },
    messages,
    treeTotals,
    activeBranchTotals,
    treeHitRate,
    activeBranchHitRate,
    activeBranchMessages,
    latestMessageId,
    series: computeCumulativeSeries(messages),
    modelStats,
    modelSwitches,
  }

  return {
    ...statsWithoutInsights,
    insights: buildCacheUsageInsights(statsWithoutInsights),
  }
}

function buildCacheUsageInsights(stats: Omit<CacheUsageStats, 'insights'>): CacheUsageInsight[] {
  const insights: CacheUsageInsight[] = []
  const firstSwitch = stats.modelSwitches[0]
  const largestDrop = [...stats.messages]
    .filter((message) => message.hitRateDelta <= HIT_RATE_DROP_THRESHOLD)
    .sort((a, b) => a.hitRateDelta - b.hitRateDelta)[0]
  const firstSpike = stats.messages.find((message) => message.cacheWriteSpike)
  const firstCacheWrite = stats.messages.find((message) => message.reasons.includes('first-cache-write'))
  const branchGap = stats.activeBranchHitRate - stats.treeHitRate
  const topCostMessage = [...stats.messages]
    .filter((message) => message.costKnown)
    .sort((a, b) => b.cost.total - a.cost.total)[0]

  if (firstSwitch) {
    insights.push({
      id: firstSwitch.id,
      kind: 'model-switch',
      severity: firstSwitch.hitRateDelta < 0 ? 'warning' : 'info',
      sequence: firstSwitch.sequence,
      previousModel: firstSwitch.fromLabel,
      model: firstSwitch.toLabel,
      previousHitRate: firstSwitch.hitRateBefore,
      hitRate: firstSwitch.hitRateAfter,
      hitRateDelta: firstSwitch.hitRateDelta,
      cacheWrite: firstSwitch.cacheWriteAfter,
      cost: firstSwitch.costAfter,
      costKnown: firstSwitch.costKnown,
      count: stats.modelSwitches.length,
    })
  }

  if (largestDrop) {
    insights.push({
      id: `hit-drop-${largestDrop.id}`,
      kind: 'hit-rate-drop',
      severity: 'warning',
      sequence: largestDrop.sequence,
      model: providerModelLabel(largestDrop.provider, largestDrop.model),
      previousHitRate: largestDrop.hitRate - largestDrop.hitRateDelta,
      hitRate: largestDrop.hitRate,
      hitRateDelta: largestDrop.hitRateDelta,
      cacheWrite: largestDrop.cacheWrite,
      cost: largestDrop.cost.total,
      costKnown: largestDrop.costKnown,
    })
  }

  if (firstSpike) {
    insights.push({
      id: `cache-write-spike-${firstSpike.id}`,
      kind: 'cache-write-spike',
      severity: 'info',
      sequence: firstSpike.sequence,
      model: providerModelLabel(firstSpike.provider, firstSpike.model),
      hitRate: firstSpike.hitRate,
      hitRateDelta: firstSpike.hitRateDelta,
      cacheWrite: firstSpike.cacheWrite,
      cost: firstSpike.cost.total,
      costKnown: firstSpike.costKnown,
    })
  } else if (firstCacheWrite) {
    insights.push({
      id: `first-cache-write-${firstCacheWrite.id}`,
      kind: 'first-cache-write',
      severity: 'success',
      sequence: firstCacheWrite.sequence,
      model: providerModelLabel(firstCacheWrite.provider, firstCacheWrite.model),
      hitRate: firstCacheWrite.hitRate,
      cacheWrite: firstCacheWrite.cacheWrite,
      cost: firstCacheWrite.cost.total,
      costKnown: firstCacheWrite.costKnown,
    })
  }

  if (Math.abs(branchGap) >= BRANCH_GAP_THRESHOLD) {
    insights.push({
      id: 'branch-gap',
      kind: 'branch-gap',
      severity: branchGap < 0 ? 'warning' : 'info',
      hitRate: stats.activeBranchHitRate,
      previousHitRate: stats.treeHitRate,
      hitRateDelta: branchGap,
      count: stats.activeBranchTotals.assistantMessages,
      totalCount: stats.treeTotals.assistantMessages,
    })
  }

  if (stats.treeTotals.cost.unknownMessages > 0) {
    insights.push({
      id: 'cost-missing',
      kind: 'cost-missing',
      severity: 'warning',
      unknownCount: stats.treeTotals.cost.unknownMessages,
      totalCount: stats.treeTotals.assistantMessages,
    })
  }

  if (topCostMessage && topCostMessage.cost.total > 0) {
    insights.push({
      id: `high-cost-${topCostMessage.id}`,
      kind: 'high-cost',
      severity: 'info',
      sequence: topCostMessage.sequence,
      model: providerModelLabel(topCostMessage.provider, topCostMessage.model),
      hitRate: topCostMessage.hitRate,
      cacheWrite: topCostMessage.cacheWrite,
      cost: topCostMessage.cost.total,
      costKnown: true,
    })
  }

  return insights
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
