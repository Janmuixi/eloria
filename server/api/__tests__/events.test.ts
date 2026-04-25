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

const listHandler = (await import('../events/index.get')).default
const createHandler = (await import('../events/index.post')).default
const getHandler = (await import('../events/[id]/index.get')).default
const updateHandler = (await import('../events/[id].put')).default
const deleteHandler = (await import('../events/[id].delete')).default

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('Events API', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  describe('GET /api/events', () => {
    it('lists only own events', async () => {
      const user1 = await createTestUser(testDb, { email: 'user1@test.com', name: 'User 1' })
      const user2 = await createTestUser(testDb, { email: 'user2@test.com', name: 'User 2' })

      createTestEvent(testDb, user1!.id, { title: 'User1 Wedding' })
      createTestEvent(testDb, user1!.id, { title: 'User1 Party' })
      createTestEvent(testDb, user2!.id, { title: 'User2 Wedding' })

      const event = authEvent(user1!.id, user1!.email)
      const result = await listHandler(event)

      expect(result).toHaveLength(2)
      expect(result.every((e: any) => e.userId === user1!.id)).toBe(true)
    })

    it('returns empty array when no events', async () => {
      const user = await createTestUser(testDb, { email: 'empty@test.com', name: 'Empty' })

      const event = authEvent(user!.id, user!.email)
      const result = await listHandler(event)

      expect(result).toEqual([])
    })
  })

  describe('POST /api/events', () => {
    it('creates event with auto-generated slug matching pattern', async () => {
      const user = await createTestUser(testDb, { email: 'create@test.com', name: 'Creator' })

      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: {
          title: 'Our Wedding',
          coupleName1: 'Alice',
          coupleName2: 'Bob',
          date: '2026-06-15',
          venue: 'Grand Hotel',
          venueAddress: '123 Main St',
        },
      })

      const result = await createHandler(event)

      expect(result.title).toBe('Our Wedding')
      expect(result.coupleName1).toBe('Alice')
      expect(result.coupleName2).toBe('Bob')
      expect(result.slug).toMatch(/^alice-and-bob-[a-z0-9]{4}$/)
      expect(result.userId).toBe(user!.id)
    })

    it('rejects missing required fields (400)', async () => {
      const user = await createTestUser(testDb, { email: 'miss@test.com', name: 'Miss' })

      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: { title: 'Incomplete' },
      })

      await expect(createHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })

  describe('GET /api/events/:id', () => {
    it('returns event with relations', async () => {
      const user = await createTestUser(testDb, { email: 'get@test.com', name: 'Getter' })
      const evt = createTestEvent(testDb, user!.id, { title: 'Get Wedding' })
      createTestGuest(testDb, evt!.id, { name: 'Guest 1' })

      const event = authEvent(user!.id, user!.email, {
        params: { id: String(evt!.id) },
      })

      const result = await getHandler(event)

      expect(result.id).toBe(evt!.id)
      expect(result.title).toBe('Get Wedding')
      expect(result).toHaveProperty('tier')
      expect(result).toHaveProperty('template')
      expect(result).toHaveProperty('guests')
      expect(result.guests).toHaveLength(1)
      expect(result.guests[0].name).toBe('Guest 1')
    })

    it('rejects access to another user\'s event (404)', async () => {
      const user1 = await createTestUser(testDb, { email: 'owner@test.com', name: 'Owner' })
      const user2 = await createTestUser(testDb, { email: 'intruder@test.com', name: 'Intruder' })
      const evt = createTestEvent(testDb, user1!.id, { title: 'Private Wedding' })

      const event = authEvent(user2!.id, user2!.email, {
        params: { id: String(evt!.id) },
      })

      await expect(getHandler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })

  describe('PUT /api/events/:id', () => {
    it('updates event fields', async () => {
      const user = await createTestUser(testDb, { email: 'update@test.com', name: 'Updater' })
      const evt = createTestEvent(testDb, user!.id, { title: 'Old Title' })

      const event = authEvent(user!.id, user!.email, {
        method: 'PUT',
        params: { id: String(evt!.id) },
        body: { title: 'New Title', venue: 'New Venue' },
      })

      const result = await updateHandler(event)

      expect(result.title).toBe('New Title')
      expect(result.venue).toBe('New Venue')
    })

    it('rejects update of another user\'s event (404)', async () => {
      const user1 = await createTestUser(testDb, { email: 'own-up@test.com', name: 'Owner' })
      const user2 = await createTestUser(testDb, { email: 'other-up@test.com', name: 'Other' })
      const evt = createTestEvent(testDb, user1!.id, { title: 'Not Yours' })

      const event = authEvent(user2!.id, user2!.email, {
        method: 'PUT',
        params: { id: String(evt!.id) },
        body: { title: 'Hacked' },
      })

      await expect(updateHandler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('clears customImagePath and deletes file when templateId is set', async () => {
      const { saveImage, imageAbsolutePath } = await import('../../utils/image-storage')
      const { existsSync, mkdtempSync, rmSync } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const sharp = (await import('sharp')).default
      const { tiers, events: eventsTable } = await import('../../db/schema')
      const { seedTemplate } = await import('../../__helpers__/db')
      const { eq } = await import('drizzle-orm')

      const root = mkdtempSync(join(tmpdir(), 'el-'))
      process.env.UPLOAD_ROOT = root
      try {
        const user = await createTestUser(testDb, { email: 'sw@test.com', name: 'SW' })
        const evt = createTestEvent(testDb, user!.id, { invitationType: 'upload' })
        const buf = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer()
        const saved = await saveImage(evt!.id, buf)
        await testDb.update(eventsTable).set({ customImagePath: saved.relativePath }).where(eq(eventsTable.id, evt!.id))
        expect(existsSync(imageAbsolutePath(saved.relativePath))).toBe(true)

        seedTiers(testDb)
        const tier = (testDb.select().from(tiers).all() as any[])[0]
        const tmpl = seedTemplate(testDb, tier.id)

        const httpEv = authEvent(user!.id, user!.email, {
          method: 'PUT', params: { id: String(evt!.id) }, body: { templateId: tmpl.id },
        })
        const result = await updateHandler(httpEv)
        expect(result.templateId).toBe(tmpl.id)
        expect(result.customImagePath).toBeNull()
        expect(result.invitationType).toBe('template')
        expect(existsSync(imageAbsolutePath(saved.relativePath))).toBe(false)
      } finally {
        rmSync(root, { recursive: true, force: true })
        delete process.env.UPLOAD_ROOT
      }
    })
  })

  describe('DELETE /api/events/:id', () => {
    it('deletes event and its guests (cascade)', async () => {
      const user = await createTestUser(testDb, { email: 'del@test.com', name: 'Deleter' })
      const evt = createTestEvent(testDb, user!.id, { title: 'Delete Me' })
      createTestGuest(testDb, evt!.id, { name: 'Guest A' })
      createTestGuest(testDb, evt!.id, { name: 'Guest B' })

      const event = authEvent(user!.id, user!.email, {
        method: 'DELETE',
        params: { id: String(evt!.id) },
      })

      const result = await deleteHandler(event)
      expect(result).toEqual({ success: true })

      // Verify event is gone
      const { events, guests } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')
      const remainingEvents = testDb.select().from(events).where(eq(events.id, evt!.id)).all()
      const remainingGuests = testDb.select().from(guests).where(eq(guests.eventId, evt!.id)).all()

      expect(remainingEvents).toHaveLength(0)
      expect(remainingGuests).toHaveLength(0)
    })

    it('rejects delete of another user\'s event (404)', async () => {
      const user1 = await createTestUser(testDb, { email: 'own-del@test.com', name: 'Owner' })
      const user2 = await createTestUser(testDb, { email: 'other-del@test.com', name: 'Other' })
      const evt = createTestEvent(testDb, user1!.id, { title: 'Not Yours' })

      const event = authEvent(user2!.id, user2!.email, {
        method: 'DELETE',
        params: { id: String(evt!.id) },
      })

      await expect(deleteHandler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })
})
