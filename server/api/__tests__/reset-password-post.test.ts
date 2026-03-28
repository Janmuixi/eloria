import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { users } from '../../db/schema'
import { hashPassword } from '../../utils/password'
import jwt from 'jsonwebtoken'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const resetPasswordPostHandler = (await import('../auth/reset-password.post')).default

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  it('requires token and new password', async () => {
    const event = createMockEvent({
      method: 'POST',
      body: {},
    })

    await expect(resetPasswordPostHandler(event)).rejects.toThrow('Token and new password are required')
  })

  it('validates password length', async () => {
    const event = createMockEvent({
      method: 'POST',
      body: { token: 'valid-token', newPassword: 'short' },
    })

    await expect(resetPasswordPostHandler(event)).rejects.toThrow('Password must be at least 8 characters')
  })

  it('returns 404 for invalid token', async () => {
    const event = createMockEvent({
      method: 'POST',
      body: { token: 'invalid-token', newPassword: 'newpassword123' },
    })

    await expect(resetPasswordPostHandler(event)).rejects.toThrow('Invalid or expired reset link')
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
      method: 'POST',
      body: { token: 'expired-token', newPassword: 'newpassword123' },
    })

    await expect(resetPasswordPostHandler(event)).rejects.toThrow('Reset link has expired')
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
      method: 'POST',
      body: { token: 'used-token', newPassword: 'newpassword123' },
    })

    await expect(resetPasswordPostHandler(event)).rejects.toThrow('Reset link has already been used')
  })

  it('updates password and clears reset token', async () => {
    const oldPasswordHash = await hashPassword('oldpassword123')
    
    testDb.insert(users).values({
      email: 'test-update@example.com',
      passwordHash: oldPasswordHash,
      name: 'Test User',
      resetToken: 'test-token',
      resetTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).run()

    const event = createMockEvent({
      method: 'POST',
      body: { token: 'test-token', newPassword: 'newpassword123' },
    })

    const result = await resetPasswordPostHandler(event)

    expect(result.token).toBeTruthy()

    const updatedUser = testDb.query.users.findFirst({
      where: (users: any, { eq }: any) => eq(users.email, 'test-update@example.com'),
    })

    const user = await updatedUser
    expect(user?.passwordHash).not.toBe(oldPasswordHash)
    expect(user?.resetToken).toBeNull()
    expect(user?.resetTokenExpiresAt).toBeNull()
  })

  it('returns valid JWT token', async () => {
    testDb.insert(users).values({
      email: 'test-jwt@example.com',
      passwordHash: 'hash',
      name: 'Test User',
      resetToken: 'jwt-token',
      resetTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).run()

    const event = createMockEvent({
      method: 'POST',
      body: { token: 'jwt-token', newPassword: 'newpassword123' },
    })

    const result = await resetPasswordPostHandler(event)

    const decoded = jwt.verify(result.token, process.env.JWT_SECRET || 'dev-secret-change-me') as { userId: number; email: string }
    expect(decoded.email).toBe('test-jwt@example.com')
  })
})
