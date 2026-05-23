import { Database } from 'lucide-react'
import { BaseSearchPlugin } from '@/plugins/base/BaseSearchPlugin'
import type { SearchContext, SearchPluginResult } from '@/plugins/types'
import type { SessionInfo } from '@/types'
import {
  appPsmTransport,
  createPluginCapabilityClient,
  type PluginRecord,
} from '@/plugins/runtime-sdk'

const SESSION_INTELLIGENCE_RECORD = 'session.intelligence'
const MAX_RESULTS = 20

interface SessionIntelligencePayload {
  summary?: string
  objective?: string
  status?: string
  topics?: string[]
  nextSteps?: string[]
  unresolvedTasks?: string[]
}

function asSessionIntelligencePayload(payload: unknown): SessionIntelligencePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {}
  }
  return payload as SessionIntelligencePayload
}

function normalizeTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export class PluginRecordSearchPlugin extends BaseSearchPlugin {
  id = 'plugin-record-search'
  icon = Database
  keywords = ['summary', 'intelligence', 'record', 'plugin', 'metadata']
  priority = 70

  private readonly client = createPluginCapabilityClient({ transport: appPsmTransport })

  get name(): string {
    return this.context?.t('plugins.pluginRecords.name', 'Plugin Records') || 'Plugin records'
  }

  get description(): string {
    return this.context?.t('plugins.pluginRecords.description', 'Search plugin-generated session records') || 'Search plugin-generated session records'
  }

  async search(query: string, context: SearchContext): Promise<SearchPluginResult[]> {
    this.setContext(context)

    try {
      const result = await this.client.records.search({
        query,
        recordType: SESSION_INTELLIGENCE_RECORD,
        scopeType: 'session',
        limit: MAX_RESULTS,
      })

      return result.hits
        .map((record) => this.toSearchResult(record, context))
        .filter((item): item is SearchPluginResult => item !== null)
    } catch (error) {
      console.error('[PluginRecordSearchPlugin] Search failed:', error)
      return []
    }
  }

  onSelect(result: SearchPluginResult, context: SearchContext): void {
    const session = result.metadata?.session as SessionInfo | undefined
    if (!session) return

    context.setSelectedSession(session)
    context.closeCommandMenu()
  }

  private toSearchResult(record: PluginRecord, context: SearchContext): SearchPluginResult | null {
    const session = context.sessions.find((item) => item.path === record.scope_id)
    if (!session) return null

    const payload = asSessionIntelligencePayload(record.payload)
    const topics = normalizeTopics(payload.topics)
    const title = payload.summary || payload.objective || session.name || session.first_message
    const descriptionParts = [payload.status, topics.slice(0, 3).join(', ')]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)

    return {
      id: `plugin-record-${record.id}`,
      pluginId: this.id,
      title: this.truncateText(title, 80),
      subtitle: session.name || session.path,
      description: descriptionParts.join(' · ') || record.searchable_text || undefined,
      icon: <Database className="w-4 h-4 text-cyan-400" />,
      metadata: {
        record,
        session,
      },
      score: typeof record.score === 'number' ? record.score : 1,
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength)}...`
  }
}
