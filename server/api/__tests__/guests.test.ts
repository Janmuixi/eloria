import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestGuest,
  seedTiers,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const listHandler = (await import('../../api/events/[id]/guests/index.get')).default
const addHandler = (await import('../../api/events/[id]/guests/index.post')).default
const deleteHandler = (await import('../../api/events/[id]/guests/[guestId].delete')).default
const importHandler = (await import('../../api/events/[id]/guests/import.post')).default

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('Guests API', () => {
  let user: Awaited<ReturnType<typeof createTestUser>>
  let evt: ReturnType<typeof createTestEvent>

  beforeEach(async () => {
    testDb = createTestDb()
    user = await createTestUser(testDb, { email: 'owner@example.com' })
    evt = createTestEvent(testDb, user.id)
  })

  describe('GET /api/events/:id/guests', () => {
    it('lists guests for an event', async () => {
      createTestGuest(testDb, evt.id, { name: 'Alice', email: 'alice@example.com' })
      createTestGuest(testDb, evt.id, { name: 'Bob', email: 'bob@example.com' })

      const event = authEvent(user.id, user.email, {
        params: { id: String(evt.id) },
      })

      const result = await listHandler(event)

      expect(result).toHaveLength(2)
      expect(result.map((g: any) => g.name)).toContain('Alice')
      expect(result.map((g: any) => g.name)).toContain('Bob')
    })

    it('rejects access to another user\'s event guests (404)', async () => {
      const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
      const otherEvent = createTestEvent(testDb, otherUser.id)
      createTestGuest(testDb, otherEvent.id, { name: 'Secret Guest' })

      const event = authEvent(user.id, user.email, {
        params: { id: String(otherEvent.id) },
      })

      await expect(listHandler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })

  describe('POST /api/events/:id/guests', () => {
    it('adds a guest with a generated UUID token', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { name: 'New Guest', email: 'new@example.com' },
      })

      const result = await addHandler(event)

      expect(result.name).toBe('New Guest')
      expect(result.email).toBe('new@example.com')
      expect(result.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
      expect(result.eventId).toBe(evt.id)
    })

    it('rejects missing guest name (400)', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { email: 'noname@example.com' },
      })

      await expect(addHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('rejects adding a guest when tier guest limit is reached (403)', async () => {
      seedTiers(testDb)
      // Basic tier (id=1) has guestLimit=50
      const limitedEvt = createTestEvent(testDb, user.id, { tierId: 1, paymentStatus: 'paid' })

      // Add 50 guests to reach the limit
      for (let i = 0; i < 50; i++) {
        createTestGuest(testDb, limitedEvt.id, { name: `Guest ${i}` })
      }

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(limitedEvt.id) },
        body: { name: 'One Too Many' },
      })

      await expect(addHandler(event)).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Guest limit reached for your plan (50)',
      })
    })

    it('allows adding a guest when under tier guest limit', async () => {
      seedTiers(testDb)
      const limitedEvt = createTestEvent(testDb, user.id, { tierId: 1, paymentStatus: 'paid' })

      // Add 49 guests — one under the limit
      for (let i = 0; i < 49; i++) {
        createTestGuest(testDb, limitedEvt.id, { name: `Guest ${i}` })
      }

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(limitedEvt.id) },
        body: { name: 'Just Fits' },
      })

      const result = await addHandler(event)
      expect(result.name).toBe('Just Fits')
    })

    it('allows unlimited guests when tier has no guest limit (Pro)', async () => {
      seedTiers(testDb)
      // Pro tier (id=3) has guestLimit=null
      const proEvt = createTestEvent(testDb, user.id, { tierId: 3, paymentStatus: 'paid' })

      for (let i = 0; i < 100; i++) {
        createTestGuest(testDb, proEvt.id, { name: `Guest ${i}` })
      }

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(proEvt.id) },
        body: { name: 'No Limit' },
      })

      const result = await addHandler(event)
      expect(result.name).toBe('No Limit')
    })

    it('allows adding guests when event has no tier assigned', async () => {
      // No tier assigned (tierId: null) — wizard flow before payment
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { name: 'Pre-Payment Guest' },
      })

      const result = await addHandler(event)
      expect(result.name).toBe('Pre-Payment Guest')
    })
  })

  describe('DELETE /api/events/:id/guests/:guestId', () => {
    it('deletes a guest', async () => {
      const guest = createTestGuest(testDb, evt.id, { name: 'Deletable' })

      const event = authEvent(user.id, user.email, {
        method: 'DELETE',
        params: { id: String(evt.id), guestId: String(guest.id) },
      })

      const result = await deleteHandler(event)

      expect(result).toEqual({ success: true })
    })

    it('rejects deleting nonexistent guest (404)', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'DELETE',
        params: { id: String(evt.id), guestId: '9999' },
      })

      await expect(deleteHandler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })

  describe('POST /api/events/:id/guests/import', () => {
    it('imports guests from CSV, including guests without email', async () => {
      const csv = 'Alice,alice@example.com\nBob\nCharlie,charlie@example.com'

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { csv },
      })

      const result = await importHandler(event)

      expect(result).toEqual({ imported: 3 })
    })

    it('rejects empty CSV (400)', async () => {
      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evt.id) },
        body: { csv: '' },
      })

      await expect(importHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('rejects import when it would exceed tier guest limit (403)', async () => {
      seedTiers(testDb)
      const limitedEvt = createTestEvent(testDb, user.id, { tierId: 1, paymentStatus: 'paid' })

      // Add 48 guests — 2 remaining
      for (let i = 0; i < 48; i++) {
        createTestGuest(testDb, limitedEvt.id, { name: `Guest ${i}` })
      }

      // Try to import 3 guests — exceeds limit by 1
      const csv = 'Alice,alice@example.com\nBob,bob@example.com\nCharlie,charlie@example.com'

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(limitedEvt.id) },
        body: { csv },
      })

      await expect(importHandler(event)).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'Import would exceed guest limit for your plan (50). You can add 2 more guests.',
      })
    })

    it('allows import when within tier guest limit', async () => {
      seedTiers(testDb)
      const limitedEvt = createTestEvent(testDb, user.id, { tierId: 1, paymentStatus: 'paid' })

      // Add 47 guests — 3 remaining
      for (let i = 0; i < 47; i++) {
        createTestGuest(testDb, limitedEvt.id, { name: `Guest ${i}` })
      }

      const csv = 'Alice,alice@example.com\nBob,bob@example.com\nCharlie,charlie@example.com'

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(limitedEvt.id) },
        body: { csv },
      })

      const result = await importHandler(event)
      expect(result).toEqual({ imported: 3 })
    })
  })
})
