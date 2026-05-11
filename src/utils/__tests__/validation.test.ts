import { describe, it, expect } from 'vitest'
import { isValidEmail, isValidUrl, isNonEmptyString, isValidPath } from '../validation'

describe('isValidEmail', () => {
  it('validates correct email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name@domain.co')).toBe(true)
    expect(isValidEmail('user+tag@domain.com')).toBe(true)
  })

  it('rejects invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('@domain.com')).toBe(false)
    expect(isValidEmail('user@')).toBe(false)
    expect(isValidEmail('user@.com')).toBe(false)
  })
})

describe('isValidUrl', () => {
  it('validates correct URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('http://localhost:3000')).toBe(true)
    expect(isValidUrl('ftp://files.example.com')).toBe(true)
  })

  it('rejects invalid URLs', () => {
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('not-a-url')).toBe(false)
    expect(isValidUrl('example.com')).toBe(false)
  })
})

describe('isNonEmptyString', () => {
  it('returns true for non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true)
    expect(isNonEmptyString('  spaces  ')).toBe(true)
    expect(isNonEmptyString('123')).toBe(true)
  })

  it('returns false for empty or whitespace strings', () => {
    expect(isNonEmptyString('')).toBe(false)
    expect(isNonEmptyString('   ')).toBe(false)
    expect(isNonEmptyString('\t\n')).toBe(false)
  })

  it('returns false for non-string values', () => {
    expect(isNonEmptyString(null as any)).toBe(false)
    expect(isNonEmptyString(undefined as any)).toBe(false)
    expect(isNonEmptyString(123 as any)).toBe(false)
  })
})

describe('isValidPath', () => {
  it('validates correct paths', () => {
    expect(isValidPath('/home/user/file.txt')).toBe(true)
    expect(isValidPath('./relative/path')).toBe(true)
    expect(isValidPath('C:\\Windows\\System32')).toBe(true)
  })

  it('rejects invalid paths', () => {
    expect(isValidPath('')).toBe(false)
    expect(isValidPath('   ')).toBe(false)
  })
})
