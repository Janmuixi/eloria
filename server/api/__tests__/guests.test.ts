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
import { menuCourses, menuOptions, guestMenuChoices } from '../../db/schema'

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
const patchHandler = (await import('../../api/events/[id]/guests/[guestId].patch')).default

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

    it('includes menuChoices for a guest who has picks', async () => {
      const guest = createTestGuest(testDb, evt.id, { name: 'Alice', email: 'alice@example.com' })
      const [course] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'Main', sortOrder: 0 }).returning().all()
      const [opt] = testDb.insert(menuOptions).values({ courseId: course.id, name: 'Beef', sortOrder: 0 }).returning().all()
      testDb.insert(guestMenuChoices).values({ guestId: guest.id, courseId: course.id, optionId: opt.id, companionId: null }).run()

      const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
      const result = await listHandler(event)

      const alice = result.find((g: any) => g.name === 'Alice')
      expect(alice).toBeDefined()
      expect(alice.menuChoices).toEqual({ [course.id]: opt.id })
      expect(alice.companionsAllowed).toBe(0)
      expect(alice.companions).toEqual([])
    })

    it('includes companions with their menu choices', async () => {
      const { companions: companionsTable } = await import('../../db/schema')
      const guest = createTestGuest(testDb, evt.id, { name: 'Bob', companionsAllowed: 2 })
      const [c1] = testDb.insert(companionsTable).values({
        guestId: guest.id, position: 1, name: 'Partner', attending: true,
      }).returning().all()
      // position 2 has no row yet (pending)

      const [course] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'Starter', sortOrder: 0 }).returning().all()
      const [selfOpt] = testDb.insert(menuOptions).values({ courseId: course.id, name: 'Soup', sortOrder: 0 }).returning().all()
      const [c1Opt] = testDb.insert(menuOptions).values({ courseId: course.id, name: 'Salad', sortOrder: 1 }).returning().all()
      testDb.insert(guestMenuChoices).values([
        { guestId: guest.id, courseId: course.id, optionId: selfOpt.id, companionId: null },
        { guestId: guest.id, courseId: course.id, optionId: c1Opt.id, companionId: c1.id },
      ]).run()

      const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
      const result = await listHandler(event)

      const bob = result.find((g: any) => g.name === 'Bob')
      expect(bob.companionsAllowed).toBe(2)
      expect(bob.companions).toHaveLength(1)
      expect(bob.companions[0]).toMatchObject({
        position: 1,
        name: 'Partner',
        attending: true,
        menuChoices: { [course.id]: c1Opt.id },
      })
      expect(bob.menuChoices).toEqual({ [course.id]: selfOpt.id })
    })

    it('parses allergies correctly', async () => {
      createTestGuest(testDb, evt.id, { name: 'Dana' })
      // Set allergies via direct DB update
      const { guests: guestsTable } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')
      testDb.update(guestsTable)
        .set({ allergies: JSON.stringify({ keys: ['nuts', 'gluten'], other: 'sesame' }) })
        .where(eq(guestsTable.eventId, evt.id))
        .run()

      const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
      const result = await listHandler(event)

      const dana = result.find((g: any) => g.name === 'Dana')
      expect(dana.allergies).toEqual({ keys: ['nuts', 'gluten'], other: 'sesame' })
    })

    it('guests with no allergies have null allergies', async () => {
      createTestGuest(testDb, evt.id, { name: 'Eve' })

      const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
      const result = await listHandler(event)

      const eve = result.find((g: any) => g.name === 'Eve')
      expect(eve.allergies).toBeNull()
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
        statusMessage: 'Seat limit reached for your plan (50)',
      })
    })

    it('counts companions toward the seat limit (403 when seat limit hit)', async () => {
      // Default Basic tier has guestLimit = 50 — override with a tighter value for the test
      const { tiers: tiersTable } = await import('../../db/schema')
      seedTiers(testDb)
      const basicTier = testDb.select().from(tiersTable).all()[0]
      testDb.update(tiersTable).set({ guestLimit: 3 }).where((await import('drizzle-orm')).eq(tiersTable.id, basicTier.id)).run()
      const evtWithLimit = createTestEvent(testDb, user.id, { tierId: basicTier.id, slug: 'limited' })

      // 2 guests, one with 1 companion = 3 seats — at the limit
      createTestGuest(testDb, evtWithLimit.id, { name: 'A', companionsAllowed: 1 })
      createTestGuest(testDb, evtWithLimit.id, { name: 'B' })

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        params: { id: String(evtWithLimit.id) },
        body: { name: 'C' },
      })

      await expect(addHandler(event)).rejects.toMatchObject({ statusCode: 403 })
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

    it('allows unlimited guests when tier has no guest limit (Premium)', async () => {
      seedTiers(testDb)
      // Premium tier (id=2) has guestLimit=null
      const proEvt = createTestEvent(testDb, user.id, { tierId: 2, paymentStatus: 'paid' })

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
        statusMessage: 'Import would exceed seat limit for your plan (50). You can add 2 more.',
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

  describe('PATCH /api/events/:id/guests/:guestId', () => {
    it('updates companionsAllowed when within seat limit', async () => {
      const guest = createTestGuest(testDb, evt.id, { name: 'Alice' })
      const event = authEvent(user.id, user.email, {
        method: 'PATCH',
        params: { id: String(evt.id), guestId: String(guest.id) },
        body: { companionsAllowed: 2 },
      })
      const result = await patchHandler(event)
      expect(result.companionsAllowed).toBe(2)
    })

    it('rejects increase that would exceed seat limit (403)', async () => {
      const { tiers: tiersTable, guests: guestsTable } = await import('../../db/schema')
      seedTiers(testDb)
      const basicTier = testDb.select().from(tiersTable).all()[0]
      testDb.update(tiersTable).set({ guestLimit: 3 }).where((await import('drizzle-orm')).eq(tiersTable.id, basicTier.id)).run()
      const evtLimited = createTestEvent(testDb, user.id, { tierId: basicTier.id, slug: 'limited-patch' })
      // 3 guests fill the limit exactly; bumping any to 1 companion would go to 4 seats
      for (let i = 0; i < 3; i++) createTestGuest(testDb, evtLimited.id, { name: `g${i}`, token: `t${i}` })
      const lastGuest = testDb.select().from(guestsTable).all().filter(g => g.eventId === evtLimited.id).at(-1)!
      const event = authEvent(user.id, user.email, {
        method: 'PATCH',
        params: { id: String(evtLimited.id), guestId: String(lastGuest.id) },
        body: { companionsAllowed: 2 },
      })
      await expect(patchHandler(event)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('cascades companion deletion when companionsAllowed is decreased', async () => {
      const { companions: companionsTable } = await import('../../db/schema')
      const guest = createTestGuest(testDb, evt.id, { name: 'Alice', companionsAllowed: 2 })
      testDb.insert(companionsTable).values([
        { guestId: guest.id, position: 1, name: 'C1', attending: true },
        { guestId: guest.id, position: 2, name: 'C2', attending: true },
      ]).run()
      const event = authEvent(user.id, user.email, {
        method: 'PATCH',
        params: { id: String(evt.id), guestId: String(guest.id) },
        body: { companionsAllowed: 1 },
      })
      await patchHandler(event)
      const remaining = testDb.select().from(companionsTable).all().filter(c => c.guestId === guest.id)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].position).toBe(1)
    })

    it('rejects out-of-range value (400)', async () => {
      const guest = createTestGuest(testDb, evt.id, { name: 'Alice' })
      for (const bad of [-1, 6, 1.5, 'two']) {
        const event = authEvent(user.id, user.email, {
          method: 'PATCH',
          params: { id: String(evt.id), guestId: String(guest.id) },
          body: { companionsAllowed: bad as any },
        })
        await expect(patchHandler(event)).rejects.toMatchObject({ statusCode: 400 })
      }
    })

    it('rejects guest not owned by user (404)', async () => {
      const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
      const otherEvt = createTestEvent(testDb, otherUser.id, { slug: 'other' })
      const otherGuest = createTestGuest(testDb, otherEvt.id, { name: 'X', token: 'other-tok' })
      const event = authEvent(user.id, user.email, {
        method: 'PATCH',
        params: { id: String(otherEvt.id), guestId: String(otherGuest.id) },
        body: { companionsAllowed: 1 },
      })
      await expect(patchHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
