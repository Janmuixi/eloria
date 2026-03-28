import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { users } from '../../db/schema'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const resetPasswordGetHandler = (await import('../auth/reset-password.get')).default

describe('GET /api/auth/reset-password', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  it('requires token', async () => {
    const event = createMockEvent({
      method: 'GET',
      url: '/api/auth/reset-password',
    })

    await expect(resetPasswordGetHandler(event)).rejects.toThrow('Reset token is required')
  })

  it('returns 404 for invalid token', async () => {
    const event = createMockEvent({
      method: 'GET',
      url: '/api/auth/reset-password?token=invalid-token',
    })

    await expect(resetPasswordGetHandler(event)).rejects.toThrow('Invalid or expired reset link')
  })

  it('returns 400 for expired token', async () => {
    testDb.insert(users).values({
      email: 'test-expired@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: 'expired-token',
      resetTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
    }).run()

    const event = createMockEvent({
      method: 'GET',
      url: '/api/auth/reset-password?token=expired-token',
    })

    await expect(resetPasswordGetHandler(event)).rejects.toThrow('Reset link has expired')
  })

  it('returns 400 if token already used', async () => {
    testDb.insert(users).values({
      email: 'test-used@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: 'used-token',
      resetTokenExpiresAt: null,
    }).run()

    const event = createMockEvent({
      method: 'GET',
      url: '/api/auth/reset-password?token=used-token',
    })

    await expect(resetPasswordGetHandler(event)).rejects.toThrow('Reset link has already been used')
  })

  it('returns user data for valid token', async () => {
    testDb.insert(users).values({
      email: 'test-valid@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: 'valid-token',
      resetTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).run()

    const event = createMockEvent({
      method: 'GET',
      url: '/api/auth/reset-password?token=valid-token',
    })

    const result = await resetPasswordGetHandler(event)

    expect(result.user).toBeDefined()
    expect(result.user.email).toBe('test-valid@example.com')
    expect(result.user.name).toBe('Test User')
  })
})
