import { describe, it, expect } from 'vitest'

export interface RPCModel {
  id: string
  name?: string
  provider: string
}

// Fuzzy match implementation from badlogic/pi-mono
interface FuzzyMatchResult {
  matches: boolean
  score: number
}

function fuzzyMatch(query: string, text: string): FuzzyMatchResult {
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()
  
  let score = 0
  let queryIdx = 0
  let textIdx = 0
  let consecutiveMatches = 0
  
  while (queryIdx < queryLower.length && textIdx < textLower.length) {
    if (queryLower[queryIdx] === textLower[textIdx]) {
      score += 1 + consecutiveMatches * 0.5
      consecutiveMatches++
      queryIdx++
    } else {
      consecutiveMatches = 0
    }
    textIdx++
  }
  
  if (queryIdx !== queryLower.length) {
    return { matches: false, score: 0 }
  }
  
  // Penalty for distance from start
  score -= textIdx * 0.1
  
  return { matches: true, score }
}

function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string
): T[] {
  if (!query.trim()) {
    return items
  }

  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)

  if (tokens.length === 0) {
    return items
  }

  const results: { item: T; totalScore: number }[] = []

  for (const item of items) {
    const text = getText(item)
    let totalScore = 0
    let allMatch = true

    for (const token of tokens) {
      const match = fuzzyMatch(token, text)
      if (match.matches) {
        totalScore += match.score
      } else {
        allMatch = false
        break
      }
    }

    if (allMatch) {
      results.push({ item, totalScore })
    }
  }

  results.sort((a, b) => a.totalScore - b.totalScore)
  return results.map((r) => r.item)
}


function tuiSearch(models: RPCModel[], searchQuery: string): RPCModel[] {
  return fuzzyFilter(
    models,
    searchQuery,
    (model) => `${model.id} ${model.provider}`
  )
}

describe('ModelSelector - TUI Fuzzy Search', () => {
  const mockModels: RPCModel[] = [
    {
      id: 'claude-opus-4-5',
      name: 'Claude Opus 4.5 (Fox)',
      provider: 'fox'
    },
    {
      id: 'glm-4.7',
      name: 'GLM-4.7 (ProxyPal)',
      provider: 'proxypal'
    },
    {
      id: 'gpt-5',
      name: 'GPT-5 (ProxyPal)',
      provider: 'proxypal'
    },
    {
      id: 'minimax-m2.1',
      name: 'MiniMax-M2.1 (ProxyPal)',
      provider: 'proxypal'
    }
  ]

  describe('基础模糊搜索', () => {
    it('should find "glm-4.7" with "glm"', () => {
      const results = tuiSearch(mockModels, 'glm')
      console.log('Search "glm":', results.map(r => r.id))
      expect(results.length).toBeGreaterThan(0)
      const found = results.some(r => r.id === 'glm-4.7')
      expect(found).toBe(true)
    })

    it('should find Claude models from fox provider', () => {
      const results = tuiSearch(mockModels, 'fox')
      console.log('Search "fox":', results.map(r => r.provider))
      expect(results.length).toBeGreaterThan(0)
      const found = results.some(r => r.provider === 'fox')
      expect(found).toBe(true)
    })

    it('should find "gpt-5" with "gpt"', () => {
      const results = tuiSearch(mockModels, 'gpt')
      console.log('Search "gpt":', results.map(r => r.id))
      expect(results.length).toBeGreaterThan(0)
      const found = results.some(r => r.id === 'gpt-5')
      expect(found).toBe(true)
    })
  })

  describe('多 token 搜索', () => {
    it('should find models matching multiple tokens', () => {
      const results = tuiSearch(mockModels, 'glm proxypal')
      console.log('Search "glm proxypal":', results.map(r => r.id))
      expect(results.length).toBeGreaterThan(0)
      const found = results.some(r => r.id === 'glm-4.7' && r.provider === 'proxypal')
      expect(found).toBe(true)
    })

    it('should find fox provider models', () => {
      const results = tuiSearch(mockModels, 'claude fox')
      console.log('Search "claude fox":', results.map(r => r.id))
      expect(results.length).toBeGreaterThan(0)
      const found = results.some(r => r.provider === 'fox')
      expect(found).toBe(true)
    })
  })

  describe('边界情况', () => {
    it('should return all models for empty query', () => {
      const results = tuiSearch(mockModels, '')
      expect(results.length).toBe(mockModels.length)
    })

    it('should return empty array for non-existent model', () => {
      const results = tuiSearch(mockModels, 'nonexistent')
      expect(results.length).toBe(0)
    })

    it('should handle whitespace-only query', () => {
      const results = tuiSearch(mockModels, '   ')
      expect(results.length).toBe(mockModels.length)
    })

    it('should be case-insensitive', () => {
      const results1 = tuiSearch(mockModels, 'GLM')
      const results2 = tuiSearch(mockModels, 'glm')
      expect(results1.length).toBe(results2.length)
      expect(results1[0]?.id).toBe(results2[0]?.id)
    })
  })

  describe('排序和评分', () => {
    it('should rank exact matches higher', () => {
      const results = tuiSearch(mockModels, 'gpt')
      // gpt-5 应该排在前面，因为 "gpt" 在 "gpt-5" 中是连续匹配
      expect(results[0]?.id).toBe('gpt-5')
    })

    it('should handle partial matches', () => {
      const results = tuiSearch(mockModels, 'max')
      console.log('Search "max":', results.map(r => r.id))
      // minimax-m2.1 应该被找到
      const found = results.some(r => r.id === 'minimax-m2.1')
      expect(found).toBe(true)
    })
  })
})