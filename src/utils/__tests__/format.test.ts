import { describe, it, expect } from 'vitest'
import { formatBytes, formatDuration, formatDate, truncateText } from '../format'

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1048576)).toBe('1 MB')
    expect(formatBytes(1073741824)).toBe('1 GB')
  })

  it('handles decimal places', () => {
    expect(formatBytes(1536, 1)).toBe('1.5 KB')
    expect(formatBytes(1536, 0)).toBe('2 KB')
  })

  it('handles negative values', () => {
    expect(formatBytes(-1024)).toBe('-1 KB')
  })
})

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(30)).toBe('30s')
    expect(formatDuration(59)).toBe('59s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(60)).toBe('1m 0s')
    expect(formatDuration(90)).toBe('1m 30s')
    expect(formatDuration(3599)).toBe('59m 59s')
  })

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3600)).toBe('1h 0m 0s')
    expect(formatDuration(3661)).toBe('1h 1m 1s')
  })
})

describe('formatDate', () => {
  it('formats date string', () => {
    const result = formatDate('2024-01-15T10:30:00Z')
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })

  it('formats Date object', () => {
    const date = new Date('2024-01-15T10:30:00Z')
    const result = formatDate(date)
    expect(result).toBeDefined()
  })

  it('handles invalid date gracefully', () => {
    const result = formatDate('invalid-date')
    expect(result).toBeDefined()
  })
})

describe('truncateText', () => {
  it('returns original text if shorter than max length', () => {
    expect(truncateText('hello', 10)).toBe('hello')
  })

  it('truncates text and adds ellipsis', () => {
    expect(truncateText('hello world', 5)).toBe('hello...')
  })

  it('handles empty string', () => {
    expect(truncateText('', 10)).toBe('')
  })

  it('handles zero max length', () => {
    expect(truncateText('hello', 0)).toBe('...')
  })

  it('handles exact length', () => {
    expect(truncateText('hello', 5)).toBe('hello')
  })
})
