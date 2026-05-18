import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDb, createTestUser, type TestDb } from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const { isAdmin, requireAdmin } = await import('../admin')
const { createToken } = await import('../auth')

describe('admin util', () => {
  beforeEach(() => {
    testDb = createTestDb()
    vi.stubGlobal('useRuntimeConfig', () => ({ ADMIN_EMAILS: 'admin@test.com' }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('isAdmin', () => {
    it('returns false for null user', () => {
      expect(isAdmin(null)).toBe(false)
    })

    it('returns false when ADMIN_EMAILS is unset', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({}))
      expect(isAdmin({ email: 'admin@test.com' })).toBe(false)
    })

    it('returns true on case-insensitive match', () => {
      expect(isAdmin({ email: 'ADMIN@TEST.com' })).toBe(true)
    })

    it('handles comma-separated allow-list with whitespace', () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ ADMIN_EMAILS: '  a@b.c , admin@test.com  ' }))
      expect(isAdmin({ email: 'a@b.c' })).toBe(true)
      expect(isAdmin({ email: 'admin@test.com' })).toBe(true)
      expect(isAdmin({ email: 'nope@test.com' })).toBe(false)
    })
  })

  describe('requireAdmin', () => {
    it('throws 401 without auth cookie', async () => {
      const event = createMockEvent({})
      await expect(requireAdmin(event)).rejects.toMatchObject({ statusCode: 401 })
    })

    it('throws 403 for non-admin user', async () => {
      const user = await createTestUser(testDb, { email: 'other@test.com', name: 'Other' })
      const token = createToken({ userId: user!.id, email: user!.email })
      const event = createMockEvent({ cookies: { auth_token: token } })
      await expect(requireAdmin(event)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('returns the user when in allow-list', async () => {
      const user = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const token = createToken({ userId: user!.id, email: user!.email })
      const event = createMockEvent({ cookies: { auth_token: token } })
      const result = await requireAdmin(event)
      expect(result.email).toBe('admin@test.com')
    })
  })
})
