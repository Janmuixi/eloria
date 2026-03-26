import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb, createTestUser, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const { createToken, verifyToken, getAuthUser, requireAuth } = await import('../auth')

describe('auth utils', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  describe('createToken / verifyToken', () => {
    it('round-trips a payload', () => {
      const payload = { userId: 42, email: 'alice@example.com' }
      const token = createToken(payload)
      const decoded = verifyToken(token)

      expect(decoded.userId).toBe(42)
      expect(decoded.email).toBe('alice@example.com')
    })

    it('verifyToken rejects a tampered token', () => {
      const token = createToken({ userId: 1, email: 'a@b.com' })
      const tampered = token.slice(0, -4) + 'XXXX'

      expect(() => verifyToken(tampered)).toThrow()
    })
  })

  describe('getAuthUser', () => {
    it('returns null when no cookie', async () => {
      const event = createMockEvent()
      const user = await getAuthUser(event)

      expect(user).toBeNull()
    })

    it('returns user when valid cookie present', async () => {
      const dbUser = await createTestUser(testDb, { email: 'auth@test.com', name: 'Auth User' })
      const token = createToken({ userId: dbUser.id, email: dbUser.email })
      const event = createMockEvent({ cookies: { auth_token: token } })

      const user = await getAuthUser(event)

      expect(user).not.toBeNull()
      expect(user!.id).toBe(dbUser.id)
      expect(user!.email).toBe('auth@test.com')
    })

    it('returns null for invalid/garbage token', async () => {
      const event = createMockEvent({ cookies: { auth_token: 'garbage.token.value' } })
      const user = await getAuthUser(event)

      expect(user).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('throws 401 when unauthenticated', async () => {
      const event = createMockEvent()

      await expect(requireAuth(event)).rejects.toMatchObject({
        statusCode: 401,
      })
    })

    it('returns user when authenticated', async () => {
      const dbUser = await createTestUser(testDb, { email: 'req@test.com', name: 'Req User' })
      const token = createToken({ userId: dbUser.id, email: dbUser.email })
      const event = createMockEvent({ cookies: { auth_token: token } })

      const user = await requireAuth(event)

      expect(user.id).toBe(dbUser.id)
      expect(user.email).toBe('req@test.com')
    })
  })
})
