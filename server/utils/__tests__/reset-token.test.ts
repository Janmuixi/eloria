import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateResetToken } from '../reset-token'

describe('generateResetToken', () => {
  it('generates a 64-character hex token', () => {
    const result = generateResetToken({ email: 'test@example.com' })

    expect(result.token).toHaveLength(64)
    expect(result.token).toMatch(/^[0-9a-f]+$/)
  })

  it('sets expiration 24 hours in future', () => {
    const result = generateResetToken({ email: 'test@example.com' })
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000

    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(now)
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(now + twentyFourHours)
  })

  it('generates unique tokens each time', () => {
    const token1 = generateResetToken({ email: 'test@example.com' })
    const token2 = generateResetToken({ email: 'test@example.com' })

    expect(token1.token).not.toBe(token2.token)
  })
})
