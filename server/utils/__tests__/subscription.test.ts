import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestDb, createTestUser, createTestSubscription, type TestDb } from '../../__helpers__/db'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const { hasActiveSubscription, getActiveSubscription } = await import('../subscription')

describe('subscription utils', () => {
  let testUser: { id: number }

  beforeEach(async () => {
    testDb = createTestDb()
    testUser = await createTestUser(testDb, { email: `test-${Date.now()}@example.com` })
  })

  describe('hasActiveSubscription', () => {
    it('returns false when user has no subscription', async () => {
      const result = await hasActiveSubscription(testUser.id)
      expect(result).toBe(false)
    })

    it('returns true when user has active subscription', async () => {
      createTestSubscription(testDb, testUser.id, { status: 'active' })
      const result = await hasActiveSubscription(testUser.id)
      expect(result).toBe(true)
    })

    it('returns false when subscription is expired', async () => {
      createTestSubscription(testDb, testUser.id, { status: 'expired' })
      const result = await hasActiveSubscription(testUser.id)
      expect(result).toBe(false)
    })
  })

  describe('getActiveSubscription', () => {
    it('returns null when user has no subscription', async () => {
      const result = await getActiveSubscription(testUser.id)
      expect(result).toBeNull()
    })

    it('returns subscription when active', async () => {
      createTestSubscription(testDb, testUser.id, {
        status: 'active',
        currentPeriodEnd: '2026-12-31',
      })
      const result = await getActiveSubscription(testUser.id)
      expect(result).not.toBeNull()
      expect(result?.status).toBe('active')
    })
  })
})
