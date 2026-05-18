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
const usersListHandler = (await import('../admin/users/index.get')).default
const userDetailHandler = (await import('../admin/users/[id].get')).default
const eventsListHandler = (await import('../admin/events/index.get')).default

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

  describe('GET /api/admin/users', () => {
    it('returns 401 without auth', async () => {
      const event = createMockEvent({})
      await expect(usersListHandler(event)).rejects.toMatchObject({ statusCode: 401 })
    })

    it('returns 403 for non-admin user', async () => {
      const user = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
      const event = authEvent(user!.id, user!.email)
      await expect(usersListHandler(event)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('returns paginated rows with eventCount and activeSubscription', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
      createTestEvent(testDb, u1!.id, { title: 'E1' })
      createTestEvent(testDb, u1!.id, { title: 'E2' })
      createTestSubscription(testDb, u1!.id, { status: 'active', price: 4900 })

      const event = authEvent(admin!.id, admin!.email)
      const result = await usersListHandler(event)

      expect(result.total).toBe(2)
      expect(result.limit).toBe(50)
      expect(result.offset).toBe(0)
      expect(result.rows).toHaveLength(2)
      const u1Row = result.rows.find((r: any) => r.email === 'a@test.com')
      expect(u1Row.eventCount).toBe(2)
      expect(u1Row.activeSubscription).toMatchObject({ status: 'active', price: 4900 })
      const adminRow = result.rows.find((r: any) => r.email === 'admin@test.com')
      expect(adminRow.eventCount).toBe(0)
      expect(adminRow.activeSubscription).toBeNull()
    })

    it('filters by q substring against email or name (case-insensitive)', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      await createTestUser(testDb, { email: 'alice@example.com', name: 'Alice' })
      await createTestUser(testDb, { email: 'bob@example.com', name: 'Bob' })

      const event = authEvent(admin!.id, admin!.email, { url: '/api/admin/users?q=ALICE' })
      const result = await usersListHandler(event)

      expect(result.total).toBe(1)
      expect(result.rows[0].email).toBe('alice@example.com')
    })

    it('respects limit and offset', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      for (let i = 0; i < 5; i++) {
        await createTestUser(testDb, { email: `u${i}@test.com`, name: `U${i}` })
      }
      const event = authEvent(admin!.id, admin!.email, { url: '/api/admin/users?limit=2&offset=1' })
      const result = await usersListHandler(event)

      expect(result.total).toBe(6)
      expect(result.limit).toBe(2)
      expect(result.offset).toBe(1)
      expect(result.rows).toHaveLength(2)
    })
  })

  describe('GET /api/admin/users/[id]', () => {
    it('returns 403 for non-admin user', async () => {
      const user = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
      const event = authEvent(user!.id, user!.email, { params: { id: String(user!.id) } })
      await expect(userDetailHandler(event)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('returns 404 for unknown user', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const event = authEvent(admin!.id, admin!.email, { params: { id: '999' } })
      await expect(userDetailHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('returns redacted user + events + subscriptions', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const target = await createTestUser(testDb, { email: 'target@test.com', name: 'Target', password: 'secret' })
      const evt = createTestEvent(testDb, target!.id, { title: 'T-Evt' })
      createTestSubscription(testDb, target!.id, { status: 'active' })

      const event = authEvent(admin!.id, admin!.email, { params: { id: String(target!.id) } })
      const result = await userDetailHandler(event)

      expect(result.user.email).toBe('target@test.com')
      expect(result.user.passwordHash).toBeNull()
      expect(result.user.hasPassword).toBe(true)
      expect(result.user.resetToken).toBeNull()
      expect(result.user.hasResetToken).toBe(false)
      expect(result.events).toHaveLength(1)
      expect(result.events[0].id).toBe(evt!.id)
      expect(result.subscriptions).toHaveLength(1)
      expect(result.subscriptions[0].status).toBe('active')
    })
  })

  describe('GET /api/admin/events', () => {
    it('returns 403 for non-admin user', async () => {
      const user = await createTestUser(testDb, { email: 'user@test.com', name: 'User' })
      const event = authEvent(user!.id, user!.email)
      await expect(eventsListHandler(event)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('returns rows joined with owner email and guestCount', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
      const evt = createTestEvent(testDb, u1!.id, { title: 'My Event' })
      const { createTestGuest } = await import('../../__helpers__/db')
      createTestGuest(testDb, evt!.id, { name: 'G1' })
      createTestGuest(testDb, evt!.id, { name: 'G2' })

      const event = authEvent(admin!.id, admin!.email)
      const result = await eventsListHandler(event)

      expect(result.total).toBe(1)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].title).toBe('My Event')
      expect(result.rows[0].user.email).toBe('a@test.com')
      expect(result.rows[0].guestCount).toBe(2)
    })

    it('filters by paymentStatus', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const u1 = await createTestUser(testDb, { email: 'a@test.com', name: 'A' })
      createTestEvent(testDb, u1!.id, { title: 'Paid', paymentStatus: 'paid' })
      createTestEvent(testDb, u1!.id, { title: 'Pending', paymentStatus: 'pending' })

      const event = authEvent(admin!.id, admin!.email, { url: '/api/admin/events?paymentStatus=paid' })
      const result = await eventsListHandler(event)

      expect(result.total).toBe(1)
      expect(result.rows[0].title).toBe('Paid')
    })

    it('filters by q against title or owner email', async () => {
      const admin = await createTestUser(testDb, { email: 'admin@test.com', name: 'Admin' })
      const u1 = await createTestUser(testDb, { email: 'alice@test.com', name: 'Alice' })
      const u2 = await createTestUser(testDb, { email: 'bob@test.com', name: 'Bob' })
      createTestEvent(testDb, u1!.id, { title: 'Alpha Wedding' })
      createTestEvent(testDb, u2!.id, { title: 'Beta Wedding' })

      const byTitle = authEvent(admin!.id, admin!.email, { url: '/api/admin/events?q=alpha' })
      expect((await eventsListHandler(byTitle)).total).toBe(1)

      const byEmail = authEvent(admin!.id, admin!.email, { url: '/api/admin/events?q=bob@' })
      const result = await eventsListHandler(byEmail)
      expect(result.total).toBe(1)
      expect(result.rows[0].title).toBe('Beta Wedding')
    })
  })
})
