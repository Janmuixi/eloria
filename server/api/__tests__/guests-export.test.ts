import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestGuest,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { menuCourses, menuOptions, guestMenuChoices, companions as companionsTable } from '../../db/schema'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const exportHandler = (await import('../../api/events/[id]/guests/export.get')).default
const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('GET /api/events/:id/guests/export', () => {
  let user: Awaited<ReturnType<typeof createTestUser>>
  let evt: ReturnType<typeof createTestEvent>

  beforeEach(async () => {
    testDb = createTestDb()
    user = await createTestUser(testDb, { email: 'owner@example.com' })
    evt = createTestEvent(testDb, user.id, { slug: 'alice-and-bob' })
  })

  it('returns 401 without auth', async () => {
    const event = createMockEvent({ params: { id: String(evt.id) } })
    await expect(exportHandler(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns 404 when the event is not owned by the user', async () => {
    const intruder = await createTestUser(testDb, { email: 'intruder@example.com' })
    const event = authEvent(intruder.id, intruder.email, { params: { id: String(evt.id) } })
    await expect(exportHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  describe('with a fake clock', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-09T08:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('sets CSV headers with attachment filename containing slug + UTC date', async () => {
      const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
      const body = (await exportHandler(event)) as string

      expect(event.node.res.getHeader('Content-Type')).toBe('text/csv; charset=utf-8')
      expect(event.node.res.getHeader('Content-Disposition')).toBe(
        'attachment; filename="alice-and-bob-guests-2026-05-09.csv"'
      )
      expect(typeof body).toBe('string')
      expect(body.startsWith('﻿')).toBe(true)
    })
  })

  it('returns header row only when the event has no guests', async () => {
    const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
    const body = (await exportHandler(event)) as string
    const rows = body.slice(1).split('\r\n')
    expect(rows[0]).toBe(
      'group_id,role,companion_position,name,email,phone,rsvp_status,companions_allowed,allergies,invited_at'
    )
    expect(rows.filter(Boolean)).toHaveLength(1) // only the header
  })

  it('emits primary + attending companion rows with menu picks', async () => {
    const guest = createTestGuest(testDb, evt.id, {
      name: 'Alice', email: 'a@x.com', rsvpStatus: 'confirmed', companionsAllowed: 2,
    })
    const [c1] = testDb.insert(companionsTable).values({
      guestId: guest.id, position: 1, name: 'Partner', attending: true,
    }).returning().all()
    testDb.insert(companionsTable).values({
      guestId: guest.id, position: 2, name: null, attending: false,
    }).run()

    const [course] = testDb.insert(menuCourses).values({
      eventId: evt.id, name: 'Plat principal', sortOrder: 0,
    }).returning().all()
    const [optBeef] = testDb.insert(menuOptions).values({
      courseId: course.id, name: 'Beef', sortOrder: 0,
    }).returning().all()
    const [optFish] = testDb.insert(menuOptions).values({
      courseId: course.id, name: 'Fish', sortOrder: 1,
    }).returning().all()
    testDb.insert(guestMenuChoices).values([
      { guestId: guest.id, courseId: course.id, optionId: optBeef.id, companionId: null },
      { guestId: guest.id, courseId: course.id, optionId: optFish.id, companionId: c1.id },
    ]).run()

    const event = authEvent(user.id, user.email, { params: { id: String(evt.id) } })
    const body = (await exportHandler(event)) as string

    const rows = body.slice(1).split('\r\n').filter(Boolean)
    expect(rows[0]).toContain('menu_plat_principal')
    expect(rows).toHaveLength(3) // header + primary + 1 attending companion
    expect(rows[1]).toContain(',primary,')
    expect(rows[1]).toContain(',Alice,')
    expect(rows[1]).toContain(',Beef')
    expect(rows[2]).toContain(',companion,1,')
    expect(rows[2]).toContain(',Partner,')
    expect(rows[2]).toContain(',Fish')
  })
})
