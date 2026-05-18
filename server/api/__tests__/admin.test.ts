import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestSubscription,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const statsHandler = (await import('../admin/stats/index.get')).default

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('Admin API', () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.stubGlobal('useRuntimeConfig', () => ({ ADMIN_EMAILS: 'admin@test.com' }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('GET /api/admin/stats', () => {
    it('returns 401 without auth', async () => {
      const event = createMockEvent({})
      await expect(statsHandler(event)).rejects.toMatchObject({ statusCode: 401 })
    })

    it('returns 403 for non-admin user', async () => {
      const user = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
      const event = authEvent(user!.id, user!.email)
      await expect(statsHandler(event)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('returns correct counters for admin', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
      const u2 = await createTestUser(testDb, { email: 'b@test.com', name: 'B' })
      createTestEvent(testDb, u1!.id, { paymentStatus: 'paid' })
      createTestEvent(testDb, u1!.id, { paymentStatus: 'pending' })
      createTestEvent(testDb, u2!.id, { paymentStatus: 'paid' })
      createTestSubscription(testDb, u1!.id, { status: 'active' })
      createTestSubscription(testDb, u2!.id, { status: 'canceled' })

      const event = authEvent(admin!.id, admin!.email)
      const result = await statsHandler(event)

      expect(result).toEqual({
        users: 3,
        events: 3,
        paidEvents: 2,
        activeSubscriptions: 1,
      })
    })
  })
})
