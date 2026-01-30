import { Coins, Zap, DollarSign } from 'lucide-react'
import type { SessionStats } from '../../types'

interface TokenStatsProps {
  stats: SessionStats
  title?: string
}

export default function TokenStats({ stats, title = 'Token Usage' }: TokenStatsProps) {
  const { token_details } = stats

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    if (cost < 1) return `$${cost.toFixed(3)}`
    return `$${cost.toFixed(2)}`
  }

  const formatTokens = (count: number) => {
    if (count === 0) return '0'
    if (count < 1000) return count.toString()
    if (count < 1000000) return `${(count / 1000).toFixed(1)}k`
    return `${(count / 1000000).toFixed(2)}M`
  }

  const topModels = Object.entries(token_details.tokens_by_model)
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 5)

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <Coins className="h-4 w-4 text-[#6a6f85]" />
          {title}
        </h3>
        <div className="text-xs text-[#6a6f85]">
          Total: <span className="text-white font-medium">{formatTokens(stats.total_tokens)}</span>
        </div>
      </div>

      {/* Token Overview */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-[#1a1b26] rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-[#569cd6]">{formatTokens(token_details.total_input)}</div>
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Input</div>
        </div>
        <div className="bg-[#1a1b26] rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-[#7ee787]">{formatTokens(token_details.total_output)}</div>
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Output</div>
        </div>
        <div className="bg-[#1a1b26] rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-[#ffa657]">{formatTokens(token_details.total_cache_read)}</div>
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Cache Read</div>
        </div>
        <div className="bg-[#1a1b26] rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-[#ff6b6b]">{formatCost(token_details.total_cost)}</div>
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Cost</div>
        </div>
      </div>

      {/* Token Distribution */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#6a6f85]">Token Distribution</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-24 text-xs text-[#6a6f85]">Input</div>
            <div className="flex-1 h-2 bg-[#1a1b26] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#569cd6] rounded-full"
                style={{
                  width: stats.total_tokens > 0
                    ? `${(token_details.total_input / stats.total_tokens) * 100}%`
                    : '0%',
                }}
              />
            </div>
            <div className="w-16 text-right text-xs text-white">
              {stats.total_tokens > 0
                ? `${((token_details.total_input / stats.total_tokens) * 100).toFixed(1)}%`
                : '0%'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-24 text-xs text-[#6a6f85]">Output</div>
            <div className="flex-1 h-2 bg-[#1a1b26] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#7ee787] rounded-full"
                style={{
                  width: stats.total_tokens > 0
                    ? `${(token_details.total_output / stats.total_tokens) * 100}%`
                    : '0%',
                }}
              />
            </div>
            <div className="w-16 text-right text-xs text-white">
              {stats.total_tokens > 0
                ? `${((token_details.total_output / stats.total_tokens) * 100).toFixed(1)}%`
                : '0%'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-24 text-xs text-[#6a6f85]">Cache</div>
            <div className="flex-1 h-2 bg-[#1a1b26] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#ffa657] rounded-full"
                style={{
                  width: stats.total_tokens > 0
                    ? `${((token_details.total_cache_read / stats.total_tokens) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            <div className="w-16 text-right text-xs text-white">
              {stats.total_tokens > 0
                ? `${((token_details.total_cache_read / stats.total_tokens) * 100).toFixed(1)}%`
                : '0%'}
            </div>
          </div>
        </div>
      </div>

      {/* Top Models by Cost */}
      {topModels.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#1a1b26]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[#6a6f85]">Top Models by Cost</span>
          </div>

          <div className="space-y-2">
            {topModels.map(([model, modelTokens]) => {
              const percent = token_details.total_cost > 0
                ? (modelTokens.cost / token_details.total_cost) * 100
                : 0

              return (
                <div
                  key={model}
                  className="flex items-center justify-between p-2 bg-[#1a1b26] rounded-lg hover:bg-[#252638] transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="text-xs font-medium text-white truncate">{model}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-[#1e1f2e] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#c792ea] rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-[#6a6f85] w-12 text-right">
                      {formatCost(modelTokens.cost)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Efficiency Metrics */}
      <div className="mt-4 pt-4 border-t border-[#1a1b26] grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Zap className="h-3 w-3 text-[#ffa657]" />
          <span className="text-[#6a6f85]">Cache Hit Rate:</span>
          <span className="text-white font-medium">
            {token_details.total_input > 0
              ? `${((token_details.total_cache_read / token_details.total_input) * 100).toFixed(1)}%`
              : '0%'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <DollarSign className="h-3 w-3 text-[#ff6b6b]" />
          <span className="text-[#6a6f85]">Avg Cost/1k Tokens:</span>
          <span className="text-white font-medium">
            {stats.total_tokens > 0
              ? formatCost((token_details.total_cost / stats.total_tokens) * 1000)
              : '$0'}
          </span>
        </div>
      </div>
    </div>
  )
}