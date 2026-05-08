import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestGuest,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { menuCourses, menuOptions, guestMenuChoices, guests as guestsTable } from '../../db/schema'
import { eq } from 'drizzle-orm'

let testDb: TestDb
let guest: ReturnType<typeof createTestGuest>

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const getHandler = (await import('../../api/rsvp/[token].get')).default
const postHandler = (await import('../../api/rsvp/[token].post')).default

describe('RSVP API', () => {
  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    const evt = createTestEvent(testDb, user.id)
    guest = createTestGuest(testDb, evt.id, {
      name: 'Invitee',
      email: 'invitee@example.com',
      token: 'valid-token-123',
    })
  })

  describe('GET /api/rsvp/:token', () => {
    it('returns guest RSVP data with empty companions when companionsAllowed = 0', async () => {
      const event = createMockEvent({
        params: { token: 'valid-token-123' },
      })

      const result = await getHandler(event)

      expect(result).toMatchObject({
        name: 'Invitee',
        rsvpStatus: 'pending',
        companionsAllowed: 0,
        companions: [],
      })
    })

    it('synthesizes empty companion entries when slots are configured but unfilled', async () => {
      const { guests: guestsTable } = await import('../../db/schema')
      testDb.update(guestsTable).set({ companionsAllowed: 2 }).where(eq(guestsTable.id, guest.id)).run()

      const result = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))

      expect(result.companionsAllowed).toBe(2)
      expect(result.companions).toHaveLength(2)
      expect(result.companions[0]).toMatchObject({
        position: 1, name: null, attending: false, menuChoices: {}, allergies: null,
      })
      expect(result.companions[1].position).toBe(2)
    })

    it('rejects invalid/nonexistent token (404)', async () => {
      const event = createMockEvent({
        params: { token: 'nonexistent-token' },
      })
      await expect(getHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('POST /api/rsvp/:token', () => {
    it('confirms RSVP', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'valid-token-123' },
        body: { rsvpStatus: 'confirmed', plusOne: false },
      })

      const result = await postHandler(event)

      expect(result).toEqual({ success: true, rsvpStatus: 'confirmed' })
    })

    it('declines RSVP', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'valid-token-123' },
        body: { rsvpStatus: 'declined', plusOne: false },
      })

      const result = await postHandler(event)

      expect(result).toEqual({ success: true, rsvpStatus: 'declined' })
    })

    it('handles plus-one', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'valid-token-123' },
        body: { rsvpStatus: 'confirmed', plusOne: true, plusOneName: 'Partner' },
      })

      const result = await postHandler(event)

      expect(result).toEqual({ success: true, rsvpStatus: 'confirmed' })

      // Verify plus-one was saved
      const getEvent = createMockEvent({
        params: { token: 'valid-token-123' },
      })
      const guestData = await getHandler(getEvent)
      expect(guestData.plusOne).toBe(true)
      expect(guestData.plusOneName).toBe('Partner')
    })

    it('clears plus-one name when plusOne is false', async () => {
      // First set a plus-one
      const setEvent = createMockEvent({
        method: 'POST',
        params: { token: 'valid-token-123' },
        body: { rsvpStatus: 'confirmed', plusOne: true, plusOneName: 'Partner' },
      })
      await postHandler(setEvent)

      // Now clear it
      const clearEvent = createMockEvent({
        method: 'POST',
        params: { token: 'valid-token-123' },
        body: { rsvpStatus: 'confirmed', plusOne: false, plusOneName: 'Partner' },
      })
      await postHandler(clearEvent)

      // Verify plus-one name was cleared
      const getEvent = createMockEvent({
        params: { token: 'valid-token-123' },
      })
      const guestData = await getHandler(getEvent)
      expect(guestData.plusOne).toBe(false)
      expect(guestData.plusOneName).toBeNull()
    })

    it('rejects invalid RSVP status (400)', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'valid-token-123' },
        body: { rsvpStatus: 'invalid-status' },
      })

      await expect(postHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('rejects nonexistent token (404)', async () => {
      const event = createMockEvent({
        method: 'POST',
        params: { token: 'nonexistent-token' },
        body: { rsvpStatus: 'confirmed', plusOne: false },
      })

      await expect(postHandler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })
})

describe('POST /api/rsvp/:token — menu picks', () => {
  let course1: any, course2: any, beef: any, salmon: any, cake: any

  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    const evt = createTestEvent(testDb, user.id, { allergiesEnabled: true })
    guest = createTestGuest(testDb, evt.id, {
      name: 'Invitee',
      email: 'invitee@example.com',
      token: 'valid-token-123',
    })
    ;[course1] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'First', sortOrder: 0 }).returning().all()
    ;[course2] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'Dessert', sortOrder: 1 }).returning().all()
    ;[beef] = testDb.insert(menuOptions).values({ courseId: course1.id, name: 'Beef', sortOrder: 0 }).returning().all()
    ;[salmon] = testDb.insert(menuOptions).values({ courseId: course1.id, name: 'Salmon', sortOrder: 1 }).returning().all()
    ;[cake] = testDb.insert(menuOptions).values({ courseId: course2.id, name: 'Cake', sortOrder: 0 }).returning().all()
  })

  it('rejects when a confirming guest is missing a course pick (400)', async () => {
    await expect(postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: { rsvpStatus: 'confirmed', plusOne: false, menuChoices: { [course1.id]: beef.id } },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('saves menu picks and allergies', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        allergies: { keys: ['nuts'], other: 'sesame' },
      },
    }))

    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.choices).toEqual({ [course1.id]: beef.id, [course2.id]: cake.id })
    expect(get.allergies).toEqual({ keys: ['nuts'], other: 'sesame' })
  })

  it('requires plus-one picks for every course when plus-one is true', async () => {
    await expect(postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: true, plusOneName: 'Partner',
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        plusOneMenuChoices: { [course1.id]: salmon.id }, // missing course2
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('discards plus-one fields when plusOne is false', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        plusOneMenuChoices: { [course1.id]: salmon.id },
        plusOneAllergies: { keys: ['dairy'], other: '' },
      },
    }))
    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.plusOneChoices).toEqual({})
    expect(get.plusOneAllergies).toBeNull()
  })

  it('ignores menu fields when declining', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'declined',
        menuChoices: { [course1.id]: beef.id, [course2.id]: cake.id },
        allergies: { keys: ['nuts'], other: '' },
      },
    }))
    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.choices).toEqual({})
    expect(get.allergies).toBeNull()
  })

  it('rejects an optionId that does not belong to the named course (400)', async () => {
    await expect(postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        menuChoices: { [course1.id]: cake.id, [course2.id]: cake.id }, // cake belongs to course2 not course1
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('POST /api/rsvp/:token — allergies gating (independent of menu)', () => {
  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    const evt = createTestEvent(testDb, user.id, { allergiesEnabled: true })
    guest = createTestGuest(testDb, evt.id, {
      name: 'Invitee',
      email: 'invitee@example.com',
      token: 'valid-token-123',
    })
  })

  it('persists allergies when allergiesEnabled = true and no menu exists', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        allergies: { keys: ['nuts'], other: 'sesame' },
      },
    }))

    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.allergies).toEqual({ keys: ['nuts'], other: 'sesame' })
  })

  it('persists plus-one allergies when allergiesEnabled = true and no menu exists', async () => {
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: true, plusOneName: 'Partner',
        allergies: { keys: [], other: '' },
        plusOneAllergies: { keys: ['dairy'], other: '' },
      },
    }))

    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.plusOneAllergies).toEqual({ keys: ['dairy'], other: '' })
  })

  it('ignores allergy fields when allergiesEnabled = false', async () => {
    // Flip the flag off for this test
    const { events: eventsTable } = await import('../../db/schema')
    const evtRow = testDb.select().from(eventsTable).all()[0]
    testDb.update(eventsTable).set({ allergiesEnabled: false }).where(eq(eventsTable.id, evtRow.id)).run()

    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        allergies: { keys: ['nuts'], other: '' },
      },
    }))

    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.allergies).toBeNull()
  })

  it('preserves stored allergies when allergiesEnabled is flipped off mid-flow', async () => {
    // Step 1: with flag on, guest submits with allergies
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: {
        rsvpStatus: 'confirmed', plusOne: false,
        allergies: { keys: ['nuts'], other: 'sesame' },
      },
    }))

    // Step 2: admin flips the flag off
    const { events: eventsTable } = await import('../../db/schema')
    const evtRow = testDb.select().from(eventsTable).all()[0]
    testDb.update(eventsTable).set({ allergiesEnabled: false }).where(eq(eventsTable.id, evtRow.id)).run()

    // Step 3: guest re-submits (e.g., to update plus-one) while flag is off — no allergy fields sent
    await postHandler(createMockEvent({
      method: 'POST', params: { token: 'valid-token-123' },
      body: { rsvpStatus: 'confirmed', plusOne: false },
    }))

    // Stored allergies must survive
    const stored = testDb.select().from(guestsTable).where(eq(guestsTable.id, guest.id)).all()[0]
    expect(stored.allergies).toBe(JSON.stringify({ keys: ['nuts'], other: 'sesame' }))

    // Step 4: admin flips the flag back on; GET should return the original allergies
    testDb.update(eventsTable).set({ allergiesEnabled: true }).where(eq(eventsTable.id, evtRow.id)).run()
    const get = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))
    expect(get.allergies).toEqual({ keys: ['nuts'], other: 'sesame' })
  })
})

describe('GET /api/rsvp/:token — menu fields', () => {
  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    const evt = createTestEvent(testDb, user.id)
    guest = createTestGuest(testDb, evt.id, {
      name: 'Invitee',
      email: 'invitee@example.com',
      token: 'valid-token-123',
    })
  })

  it('returns null menu when none exists', async () => {
    const event = createMockEvent({ params: { token: 'valid-token-123' } })
    const result = await getHandler(event)
    expect(result.menu).toBeNull()
    expect(result.choices).toEqual({})
    expect(result.allergies).toBeNull()
  })

  it('returns menu tree and existing choices', async () => {
    // Build a menu under the same event the guest belongs to.
    const evt = testDb.select().from((await import('../../db/schema')).events).all()[0]
    testDb.update((await import('../../db/schema')).events)
      .set({ allergiesEnabled: true })
      .where(eq((await import('../../db/schema')).events.id, evt.id)).run()
    const [course] = testDb.insert(menuCourses).values({ eventId: evt.id, name: 'First', sortOrder: 0 }).returning().all()
    const [opt] = testDb.insert(menuOptions).values({ courseId: course.id, name: 'Beef', sortOrder: 0 }).returning().all()
    testDb.insert(guestMenuChoices).values({ guestId: guest.id, courseId: course.id, optionId: opt.id, forPlusOne: false }).run()
    testDb.update(guestsTable).set({ allergies: JSON.stringify({ keys: ['nuts'], other: '' }) }).where(eq(guestsTable.id, guest.id)).run()

    const event = createMockEvent({ params: { token: 'valid-token-123' } })
    const result = await getHandler(event)

    expect(result.menu?.courses).toHaveLength(1)
    expect(result.choices).toEqual({ [course.id]: opt.id })
    expect(result.allergies).toEqual({ keys: ['nuts'], other: '' })
  })

  it('returns allergiesEnabled = false by default and nulls stored allergies', async () => {
    testDb.update(guestsTable).set({
      allergies: JSON.stringify({ keys: ['nuts'], other: '' }),
      plusOneAllergies: JSON.stringify({ keys: ['dairy'], other: '' }),
    }).where(eq(guestsTable.id, guest.id)).run()

    const result = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))

    expect(result.allergiesEnabled).toBe(false)
    expect(result.allergies).toBeNull()
    expect(result.plusOneAllergies).toBeNull()
  })

  it('returns stored allergies when allergiesEnabled = true', async () => {
    const evtRow = testDb.select().from((await import('../../db/schema')).events).all()[0]
    testDb.update((await import('../../db/schema')).events)
      .set({ allergiesEnabled: true })
      .where(eq((await import('../../db/schema')).events.id, evtRow.id)).run()
    testDb.update(guestsTable).set({
      allergies: JSON.stringify({ keys: ['nuts'], other: '' }),
      plusOneAllergies: JSON.stringify({ keys: ['dairy'], other: '' }),
    }).where(eq(guestsTable.id, guest.id)).run()

    const result = await getHandler(createMockEvent({ params: { token: 'valid-token-123' } }))

    expect(result.allergiesEnabled).toBe(true)
    expect(result.allergies).toEqual({ keys: ['nuts'], other: '' })
    expect(result.plusOneAllergies).toEqual({ keys: ['dairy'], other: '' })
  })
})
