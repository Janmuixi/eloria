import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestGuest,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { menuCourses, menuOptions } from '../../db/schema'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() { return testDb },
}))

vi.mock('~/server/utils/auth', () => ({
  requireAuth: vi.fn(async () => ({ id: currentUserId })),
}))

let currentUserId = 0

const getMenuHandler = (await import('../../api/events/[id]/menu/index.get')).default

describe('GET /api/events/:id/menu', () => {
  let eventId: number

  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    currentUserId = user.id
    const evt = createTestEvent(testDb, user.id)
    eventId = evt.id
  })

  it('returns empty courses when no menu exists', async () => {
    const event = createMockEvent({ params: { id: String(eventId) } })
    const result = await getMenuHandler(event)
    expect(result).toEqual({ courses: [] })
  })

  it('returns courses with options ordered by sortOrder', async () => {
    const [c1] = testDb.insert(menuCourses).values({ eventId, name: 'First', sortOrder: 0 }).returning().all()
    const [c2] = testDb.insert(menuCourses).values({ eventId, name: 'Second', sortOrder: 1 }).returning().all()
    testDb.insert(menuOptions).values([
      { courseId: c1.id, name: 'Beef', sortOrder: 1 },
      { courseId: c1.id, name: 'Salmon', sortOrder: 0 },
      { courseId: c2.id, name: 'Cake', sortOrder: 0 },
    ]).run()

    const event = createMockEvent({ params: { id: String(eventId) } })
    const result = await getMenuHandler(event)

    expect(result.courses).toHaveLength(2)
    expect(result.courses[0].name).toBe('First')
    expect(result.courses[0].options.map(o => o.name)).toEqual(['Salmon', 'Beef'])
    expect(result.courses[1].name).toBe('Second')
  })

  it('rejects when user does not own event (404)', async () => {
    const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
    currentUserId = otherUser.id
    const event = createMockEvent({ params: { id: String(eventId) } })
    await expect(getMenuHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })
})
