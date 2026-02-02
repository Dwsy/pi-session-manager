import { useCallback } from 'react'
import type { SessionInfo, SearchResult, SessionEntry, SessionStats, HeatmapPoint, TimeDistributionPoint, ModelTokenStats } from '../types'
import { format, subDays } from 'date-fns'

// Token cost rates (USD per million tokens for common models)
const TOKEN_RATES: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 30, output: 60 },
  'gpt-4o': { input: 5, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'default': { input: 1, output: 2 },
}

const DEMO_SESSIONS: SessionInfo[] = [
  {
    path: '/demo/project-a/session-001.jsonl',
    id: 'demo-001',
    cwd: '/Users/dev/project-a',
    name: 'Implement JWT Authentication',
    created: '2026-01-25T09:00:00Z',
    modified: '2026-01-25T10:30:00Z',
    message_count: 24,
    first_message: 'Help me implement a JWT authentication system',
    all_messages_text: 'Help me implement a JWT authentication system with user login, registration, and token verification',
    last_message: 'Authentication system completed with full test coverage',
    last_message_role: 'assistant',
    isFavorite: true,
  },
  {
    path: '/demo/project-a/session-002.jsonl',
    id: 'demo-002',
    cwd: '/Users/dev/project-a',
    name: 'Database Performance Optimization',
    created: '2026-01-25T14:00:00Z',
    modified: '2026-01-25T15:45:00Z',
    message_count: 18,
    first_message: 'Database queries are too slow, please help optimize',
    all_messages_text: 'Database queries are too slow, please help optimize. Need to add indexes and optimize query statements',
    last_message: 'Indexes added and slow queries optimized. Performance improved by 80%',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-b/session-003.jsonl',
    id: 'demo-003',
    cwd: '/Users/dev/project-b',
    name: 'Frontend Component Library',
    created: '2026-01-26T08:00:00Z',
    modified: '2026-01-26T12:00:00Z',
    message_count: 32,
    first_message: 'I need to create a reusable Button component',
    all_messages_text: 'I need to create a reusable Button component supporting multiple sizes and variants',
    last_message: 'Button component completed with full TypeScript type definitions',
    last_message_role: 'assistant',
    isFavorite: true,
  },
  {
    path: '/demo/project-b/session-004.jsonl',
    id: 'demo-004',
    cwd: '/Users/dev/project-b',
    name: 'RESTful API Design',
    created: '2026-01-26T13:00:00Z',
    modified: '2026-01-26T14:30:00Z',
    message_count: 15,
    first_message: 'Help me design RESTful API interface specifications',
    all_messages_text: 'Help me design RESTful API interface specifications following best practices',
    last_message: 'API design documentation generated with all endpoints and examples',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-c/session-005.jsonl',
    id: 'demo-005',
    cwd: '/Users/dev/project-c',
    name: 'Docker Container Deployment',
    created: '2026-01-27T09:00:00Z',
    modified: '2026-01-27T11:00:00Z',
    message_count: 20,
    first_message: 'How to deploy the application to Docker containers',
    all_messages_text: 'How to deploy the application to Docker containers. Need to write Dockerfile and docker-compose.yml',
    last_message: 'Docker configuration completed with one-click deployment support',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-c/session-006.jsonl',
    id: 'demo-006',
    cwd: '/Users/dev/project-c',
    name: 'Unit Test Coverage Improvement',
    created: '2026-01-27T14:00:00Z',
    modified: '2026-01-27T16:00:00Z',
    message_count: 28,
    first_message: 'Test coverage is only 50%, need to increase to 80%',
    all_messages_text: 'Test coverage is only 50%, need to increase to 80%. Need to add test cases for core modules',
    last_message: 'Test coverage increased to 85%, added 120+ test cases',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-a/session-007.jsonl',
    id: 'demo-007',
    cwd: '/Users/dev/project-a',
    name: 'Redis Cache Integration',
    created: '2026-01-28T09:00:00Z',
    modified: '2026-01-28T10:30:00Z',
    message_count: 16,
    first_message: 'Integrate Redis cache to improve performance',
    all_messages_text: 'Integrate Redis cache to improve performance. Need to cache hot data',
    last_message: 'Redis cache integrated. Response time reduced from 200ms to 50ms',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-b/session-008.jsonl',
    id: 'demo-008',
    cwd: '/Users/dev/project-b',
    name: 'Responsive Design Implementation',
    created: '2026-01-28T11:00:00Z',
    modified: '2026-01-28T13:00:00Z',
    message_count: 22,
    first_message: 'Make the website support mobile responsive layout',
    all_messages_text: 'Make the website support mobile responsive layout using Tailwind CSS',
    last_message: 'Responsive layout completed, perfectly supports all screen sizes',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-d/session-009.jsonl',
    id: 'demo-009',
    cwd: '/Users/dev/project-d',
    name: 'WebSocket Real-time Communication',
    created: '2026-01-29T08:00:00Z',
    modified: '2026-01-29T11:00:00Z',
    message_count: 25,
    first_message: 'Implement WebSocket real-time message push',
    all_messages_text: 'Implement WebSocket real-time message push. Need to support auto-reconnect',
    last_message: 'WebSocket service completed with heartbeat detection and auto-reconnect',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-d/session-010.jsonl',
    id: 'demo-010',
    cwd: '/Users/dev/project-d',
    name: 'Logging System Setup',
    created: '2026-01-29T13:00:00Z',
    modified: '2026-01-29T15:00:00Z',
    message_count: 19,
    first_message: 'Set up structured logging system',
    all_messages_text: 'Set up structured logging system using Winston and Logstash',
    last_message: 'Logging system set up with log level support and centralized collection',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-a/session-011.jsonl',
    id: 'demo-011',
    cwd: '/Users/dev/project-a',
    name: 'Payment Integration',
    created: '2026-01-30T09:00:00Z',
    modified: '2026-01-30T11:30:00Z',
    message_count: 30,
    first_message: 'Integrate Stripe payment interface',
    all_messages_text: 'Integrate Stripe payment interface. Need to handle callback notifications',
    last_message: 'Payment interface integration completed. Supports subscription and one-time payments',
    last_message_role: 'assistant',
  },
  {
    path: '/demo/project-b/session-012.jsonl',
    id: 'demo-012',
    cwd: '/Users/dev/project-b',
    name: 'Animation Performance Optimization',
    created: '2026-01-30T13:00:00Z',
    modified: '2026-01-30T14:30:00Z',
    message_count: 14,
    first_message: 'Optimize page animation performance',
    all_messages_text: 'Optimize page animation performance. Use CSS GPU acceleration',
    last_message: 'Animation optimized. FPS increased from 30 to 60',
    last_message_role: 'assistant',
  },
]

const DEMO_FAVORITES = [
  {
    id: 'fav-001',
    type: 'session' as const,
    name: 'Implement JWT Authentication',
    path: '/demo/project-a/session-001.jsonl',
    addedAt: '2026-01-25T10:00:00Z',
  },
  {
    id: 'fav-002',
    type: 'project' as const,
    name: 'project-a',
    path: '/Users/dev/project-a',
    addedAt: '2026-01-25T10:00:00Z',
  },
  {
    id: 'fav-003',
    type: 'session' as const,
    name: 'Frontend Component Library',
    path: '/demo/project-b/session-003.jsonl',
    addedAt: '2026-01-26T12:00:00Z',
  },
]

interface UseDemoModeReturn {
  isDemoMode: boolean
  getDemoSessions: () => SessionInfo[]
  getDemoFavorites: () => any[]
  getDemoSessionContent: (path: string) => string
  searchDemoSessions: (query: string, sessions: SessionInfo[]) => SearchResult[]
}

// Standalone function to generate demo stats (exported for direct use)
export function getDemoStats(): SessionStats {
  const today = new Date()
  const messagesByDate: Record<string, number> = {}
  const messagesByHour: Record<string, number> = {}
  const messagesByDayOfWeek: Record<string, number> = {}
  const heatmapData: HeatmapPoint[] = []
  const timeDistribution: TimeDistributionPoint[] = []
  const tokensByModel: Record<string, ModelTokenStats> = {}

  // Generate 30 days of data
  for (let i = 29; i >= 0; i--) {
    const date = subDays(today, i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayOfWeek = format(date, 'EEEE')

    // Random message count (0-50)
    const messageCount = Math.floor(Math.random() * 50) + 5
    messagesByDate[dateStr] = messageCount

    // Day of week distribution
    if (!messagesByDayOfWeek[dayOfWeek]) {
      messagesByDayOfWeek[dayOfWeek] = 0
    }
    messagesByDayOfWeek[dayOfWeek] += messageCount

    // Heatmap data (level 0-5)
    const level = messageCount > 40 ? 5 : messageCount > 30 ? 4 : messageCount > 20 ? 3 : messageCount > 10 ? 2 : messageCount > 5 ? 1 : 0
    heatmapData.push({ date: dateStr, level })
  }

  // Hourly distribution (0-23)
  for (let h = 0; h < 24; h++) {
    // More activity during working hours (9-18)
    const baseActivity = h >= 9 && h <= 18 ? 20 : 5
    const randomVariation = Math.floor(Math.random() * 15)
    messagesByHour[h.toString()] = baseActivity + randomVariation
    timeDistribution.push({ hour: h, message_count: baseActivity + randomVariation })
  }

  // Model distribution
  const models = ['gpt-4o', 'gpt-4o-mini', 'claude-3-sonnet', 'claude-3-haiku']
  models.forEach(model => {
    const inputTokens = Math.floor(Math.random() * 50000) + 10000
    const outputTokens = Math.floor(Math.random() * 30000) + 5000
    const cacheRead = Math.floor(Math.random() * 5000)
    const cacheWrite = Math.floor(Math.random() * 2000)

    const rates = TOKEN_RATES[model] || TOKEN_RATES['default']
    const cost = (inputTokens / 1000000) * rates.input + (outputTokens / 1000000) * rates.output

    tokensByModel[model] = {
      input: inputTokens,
      output: outputTokens,
      cache_read: cacheRead,
      cache_write: cacheWrite,
      cost,
    }
  })

  // Calculate totals
  let totalInput = 0
  let totalOutput = 0
  let totalCacheRead = 0
  let totalCacheWrite = 0
  let totalCost = 0
  let totalTokens = 0

  Object.values(tokensByModel).forEach(stats => {
    totalInput += stats.input
    totalOutput += stats.output
    totalCacheRead += stats.cache_read
    totalCacheWrite += stats.cache_write
    totalCost += stats.cost
    totalTokens += stats.input + stats.output
  })

  // Total messages
  const totalMessages = Object.values(messagesByDate).reduce((sum, count) => sum + count, 0)
  const userMessages = Math.floor(totalMessages * 0.45)
  const assistantMessages = Math.floor(totalMessages * 0.55)

  // Sessions by project
  const sessionsByProject: Record<string, number> = {
    'project-a': 4,
    'project-b': 4,
    'project-c': 2,
    'project-d': 2,
  }

  // Sessions by model
  const sessionsByModel: Record<string, number> = {
    'gpt-4o': 5,
    'gpt-4o-mini': 3,
    'claude-3-sonnet': 2,
    'claude-3-haiku': 2,
  }

  return {
    total_sessions: 12,
    total_messages: totalMessages,
    user_messages: userMessages,
    assistant_messages: assistantMessages,
    total_tokens: totalTokens,
    sessions_by_project: sessionsByProject,
    sessions_by_model: sessionsByModel,
    messages_by_date: messagesByDate,
    messages_by_hour: messagesByHour,
    messages_by_day_of_week: messagesByDayOfWeek,
    average_messages_per_session: totalMessages / 12,
    heatmap_data: heatmapData,
    time_distribution: timeDistribution,
    token_details: {
      total_input: totalInput,
      total_output: totalOutput,
      total_cache_read: totalCacheRead,
      total_cache_write: totalCacheWrite,
      total_cost: totalCost,
      tokens_by_model: tokensByModel,
    },
  }
}

export function useDemoMode(): UseDemoModeReturn {
  const getIsDemoMode = useCallback((): boolean => {
    try {
      const settings = localStorage.getItem('pi-session-manager-settings')
      if (settings) {
        const parsed = JSON.parse(settings)
        return parsed?.advanced?.demoMode === true
      }
    } catch (error) {
      console.error('Failed to parse settings:', error)
    }
    return false
  }, [])

  const getDemoSessions = useCallback((): SessionInfo[] => {
    return [...DEMO_SESSIONS]
  }, [])

  const getDemoFavorites = useCallback(() => {
    return [...DEMO_FAVORITES]
  }, [])

  const getDemoSessionContent = useCallback((path: string): string => {
    const session = DEMO_SESSIONS.find(s => s.path === path)
    if (!session) return ''

    const entries: SessionEntry[] = [
      {
        type: 'session',
        id: session.id,
        parentId: undefined,
        timestamp: session.created,
      },
      {
        type: 'message',
        id: `${session.id}-msg-1`,
        parentId: session.id,
        timestamp: session.created,
        message: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: session.first_message,
            },
          ],
        },
      },
      {
        type: 'message',
        id: `${session.id}-msg-2`,
        parentId: `${session.id}-msg-1`,
        timestamp: new Date(new Date(session.created).getTime() + 1000).toISOString(),
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `Sure, I'll help you with ${session.name}.\n\nFirst, let me understand your specific requirements:\n\n1. What technology stack are you using?\n2. Are there any specific performance requirements?\n3. Do you need backward compatibility?\n\nPlease provide more details and I'll provide the best solution.`,
            },
          ],
        },
      },
      {
        type: 'message',
        id: `${session.id}-msg-3`,
        parentId: `${session.id}-msg-2`,
        timestamp: new Date(new Date(session.created).getTime() + 5000).toISOString(),
        message: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'The tech stack is React + TypeScript + Node.js. No special performance requirements, no need for backward compatibility.',
            },
          ],
        },
      },
      {
        type: 'message',
        id: `${session.id}-msg-4`,
        parentId: `${session.id}-msg-3`,
        timestamp: new Date(new Date(session.created).getTime() + 10000).toISOString(),
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `Great! Based on your requirements, here's my recommended solution:\n\n\`\`\`typescript\n// Core implementation code\ninterface Solution {\n  framework: string\n  language: string\n  approach: string\n}\n\nconst solution: Solution = {\n  framework: 'React',\n  language: 'TypeScript',\n  approach: 'Modern patterns'\n}\n\`\`\`\n\nAdvantages of this solution:\n- ✅ Type safety\n- ✅ Easy to maintain\n- ✅ Excellent performance\n\nWould you like me to expand on the code implementation?`,
            },
          ],
        },
      },
      {
        type: 'message',
        id: `${session.id}-msg-5`,
        parentId: `${session.id}-msg-4`,
        timestamp: new Date(new Date(session.created).getTime() + 15000).toISOString(),
        message: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please expand in detail, I need the complete implementation code.',
            },
          ],
        },
      },
      {
        type: 'message',
        id: `${session.id}-msg-6`,
        parentId: `${session.id}-msg-5`,
        timestamp: new Date(new Date(session.created).getTime() + 20000).toISOString(),
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `Alright, here's the complete implementation code:\n\n\`\`\`typescript\n// 1. Type definitions\ntype Config = {\n  debug: boolean\n  version: string\n}\n\n// 2. Main class implementation\nclass CoreService {\n  private config: Config\n\n  constructor(config: Config) {\n    this.config = config\n  }\n\n  async initialize() {\n    console.log('Initializing...')\n    // Initialization logic\n    return true\n  }\n}\n\`\`\`\n\nAbove is the core code framework. ${session.last_message}`,
            },
          ],
        },
      },
    ]

    return entries.map(e => JSON.stringify(e)).join('\n')
  }, [])

  const searchDemoSessions = useCallback((
    query: string,
    sessions: SessionInfo[]
  ): SearchResult[] => {
    if (!query.trim()) return []

    const lowerQuery = query.toLowerCase()
    const results: SearchResult[] = []

    sessions.forEach(session => {
      const matches: any[] = []

      // Search in name
      if (session.name?.toLowerCase().includes(lowerQuery)) {
        matches.push({
          entry_id: `${session.id}-name`,
          role: 'name',
          snippet: session.name,
          timestamp: session.modified,
        })
      }

      // Search in first message
      if (session.first_message.toLowerCase().includes(lowerQuery)) {
        matches.push({
          entry_id: `${session.id}-first`,
          role: 'user',
          snippet: session.first_message,
          timestamp: session.created,
        })
      }

      // Search in directory
      if (session.cwd.toLowerCase().includes(lowerQuery)) {
        matches.push({
          entry_id: `${session.id}-cwd`,
          role: 'cwd',
          snippet: session.cwd,
          timestamp: session.created,
        })
      }

      if (matches.length > 0) {
        results.push({
          session_id: session.id,
          session_path: session.path,
          session_name: session.name,
          first_message: session.first_message,
          matches,
          score: matches.length * 10,
        })
      }
    })

    return results.sort((a, b) => b.score - a.score)
  }, [])

  return {
    isDemoMode: getIsDemoMode(),
    getDemoSessions,
    getDemoFavorites,
    getDemoSessionContent,
    searchDemoSessions,
  }
}