import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestGuest,
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
  })
})
