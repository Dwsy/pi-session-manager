import { Coins, Zap, DollarSign } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionStats } from '../types'

interface TokenStatsProps {
  stats: SessionStats
  title?: string
}

export default function TokenStats({ stats, title }: TokenStatsProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.tokenStats.tokenUsage')
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
    <div className="glass-card rounded-xl p-5 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#ffcb6b]/5 via-transparent to-[#ff6b6b]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2 text-white">
            <div className="p-1.5 rounded-lg bg-[#ffcb6b]/10">
              <Coins className="h-4 w-4 text-[#ffcb6b]" />
            </div>
            {displayTitle}
          </h3>
          <div className="text-xs text-[#6a6f85] bg-[#1a1b26]/60 px-2.5 py-1 rounded-lg">
            {t('dashboard.tokenStats.total')}: <span className="text-white font-medium">{formatTokens(stats.total_tokens)}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-[#1a1b26]/60 rounded-xl p-3 text-center border border-[#569cd6]/10 hover:border-[#569cd6]/30 transition-all duration-300">
            <div className="text-lg font-bold text-[#569cd6]">{formatTokens(token_details.total_input)}</div>
            <div className="text-[10px] text-[#6a6f85] uppercase tracking-wider font-medium">{t('dashboard.tokenStats.input')}</div>
          </div>
          <div className="bg-[#1a1b26]/60 rounded-xl p-3 text-center border border-[#7ee787]/10 hover:border-[#7ee787]/30 transition-all duration-300">
            <div className="text-lg font-bold text-[#7ee787]">{formatTokens(token_details.total_output)}</div>
            <div className="text-[10px] text-[#6a6f85] uppercase tracking-wider font-medium">{t('dashboard.tokenStats.output')}</div>
          </div>
          <div className="bg-[#1a1b26]/60 rounded-xl p-3 text-center border border-[#ffa657]/10 hover:border-[#ffa657]/30 transition-all duration-300">
            <div className="text-lg font-bold text-[#ffa657]">{formatTokens(token_details.total_cache_read)}</div>
            <div className="text-[10px] text-[#6a6f85] uppercase tracking-wider font-medium">{t('dashboard.tokenStats.cache')}</div>
          </div>
          <div className="bg-[#1a1b26]/60 rounded-xl p-3 text-center border border-[#ff6b6b]/10 hover:border-[#ff6b6b]/30 transition-all duration-300">
            <div className="text-lg font-bold text-[#ff6b6b]">{formatCost(token_details.total_cost)}</div>
            <div className="text-[10px] text-[#6a6f85] uppercase tracking-wider font-medium">{t('dashboard.tokenStats.cost')}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6a6f85]">{t('dashboard.tokenStats.tokenDistribution')}</span>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="w-24 text-xs text-[#6a6f85]">{t('dashboard.tokenStats.input')}</div>
              <div className="flex-1 h-2.5 bg-[#1a1b26]/80 rounded-full overflow-hidden inner-shadow">
                <div
                  className="h-full bg-gradient-to-r from-[#569cd6] to-[#6bb8ff] rounded-full transition-all duration-500"
                  style={{
                    width: stats.total_tokens > 0
                      ? `${(token_details.total_input / stats.total_tokens) * 100}%`
                      : '0%',
                    boxShadow: '0 0 10px rgba(86, 156, 214, 0.3)'
                  }}
                />
              </div>
              <div className="w-16 text-right text-xs text-white font-medium">
                {stats.total_tokens > 0
                  ? `${((token_details.total_input / stats.total_tokens) * 100).toFixed(1)}%`
                  : '0%'}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-24 text-xs text-[#6a6f85]">{t('dashboard.tokenStats.output')}</div>
              <div className="flex-1 h-2.5 bg-[#1a1b26]/80 rounded-full overflow-hidden inner-shadow">
                <div
                  className="h-full bg-gradient-to-r from-[#7ee787] to-[#a3ff9e] rounded-full transition-all duration-500"
                  style={{
                    width: stats.total_tokens > 0
                      ? `${(token_details.total_output / stats.total_tokens) * 100}%`
                      : '0%',
                    boxShadow: '0 0 10px rgba(126, 231, 135, 0.3)'
                  }}
                />
              </div>
              <div className="w-16 text-right text-xs text-white font-medium">
                {stats.total_tokens > 0
                  ? `${((token_details.total_output / stats.total_tokens) * 100).toFixed(1)}%`
                  : '0%'}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-24 text-xs text-[#6a6f85]">{t('dashboard.tokenStats.cache')}</div>
              <div className="flex-1 h-2.5 bg-[#1a1b26]/80 rounded-full overflow-hidden inner-shadow">
                <div
                  className="h-full bg-gradient-to-r from-[#ffa657] to-[#ffc48c] rounded-full transition-all duration-500"
                  style={{
                    width: stats.total_tokens > 0
                      ? `${((token_details.total_cache_read / stats.total_tokens) * 100)}%`
                      : '0%',
                    boxShadow: '0 0 10px rgba(255, 166, 87, 0.3)'
                  }}
                />
              </div>
              <div className="w-16 text-right text-xs text-white font-medium">
                {stats.total_tokens > 0
                  ? `${((token_details.total_cache_read / stats.total_tokens) * 100).toFixed(1)}%`
                  : '0%'}
              </div>
            </div>
          </div>
        </div>

        {topModels.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[#6a6f85]">{t('dashboard.tokenStats.topModelsByCost')}</span>
            </div>

            <div className="space-y-2">
              {topModels.map(([model, modelTokens]) => {
                const percent = token_details.total_cost > 0
                  ? (modelTokens.cost / token_details.total_cost) * 100
                  : 0

                return (
                  <div
                    key={model}
                    className="flex items-center justify-between p-2.5 bg-[#1a1b26]/60 rounded-xl border border-white/5 hover:bg-[#1a1b26]/90 hover:border-[#c792ea]/20 transition-all duration-300"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="text-xs font-medium text-white/90 truncate">{model}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-[#1e1f2e]/80 rounded-full overflow-hidden inner-shadow">
                        <div
                          className="h-full bg-gradient-to-r from-[#c792ea] to-[#d4a8f0] rounded-full"
                          style={{
                            width: `${percent}%`,
                            boxShadow: '0 0 6px rgba(199, 146, 234, 0.3)'
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-[#6a6f85] w-12 text-right font-medium">
                        {formatCost(modelTokens.cost)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-xs bg-[#1a1b26]/40 px-3 py-2 rounded-lg">
            <Zap className="h-3 w-3 text-[#ffa657]" />
            <span className="text-[#6a6f85]">{t('dashboard.tokenStats.cacheHitRate')}:</span>
            <span className="text-white font-medium">
              {token_details.total_input > 0
                ? `${((token_details.total_cache_read / token_details.total_input) * 100).toFixed(1)}%`
                : '0%'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs bg-[#1a1b26]/40 px-3 py-2 rounded-lg">
            <DollarSign className="h-3 w-3 text-[#ff6b6b]" />
            <span className="text-[#6a6f85]">{t('dashboard.tokenStats.avgCostPer1kTokens')}:</span>
            <span className="text-white font-medium">
              {stats.total_tokens > 0
                ? formatCost((token_details.total_cost / stats.total_tokens) * 1000)
                : '$0'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}