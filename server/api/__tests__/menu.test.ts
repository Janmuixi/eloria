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
const putMenuHandler = (await import('../../api/events/[id]/menu/index.put')).default

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

describe('PUT /api/events/:id/menu', () => {
  let eventId: number

  beforeEach(async () => {
    testDb = createTestDb()
    const user = await createTestUser(testDb, { email: 'host@example.com' })
    currentUserId = user.id
    const evt = createTestEvent(testDb, user.id)
    eventId = evt.id
  })

  it('creates a menu from scratch', async () => {
    const body = {
      courses: [
        { name: 'First', sortOrder: 0, options: [{ name: 'Beef', sortOrder: 0 }, { name: 'Salmon', sortOrder: 1 }] },
        { name: 'Second', sortOrder: 1, options: [{ name: 'Cake', sortOrder: 0 }] },
      ],
    }
    const event = createMockEvent({ method: 'PUT', params: { id: String(eventId) }, body })
    const result = await putMenuHandler(event)
    expect(result.courses).toHaveLength(2)
    expect(result.courses[0].options).toHaveLength(2)
    expect(result.courses[0].options[0].id).toBeGreaterThan(0)
  })

  it('preserves option ids on rename so guest picks survive', async () => {
    // Initial save
    const initial = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: { courses: [{ name: 'First', sortOrder: 0, options: [{ name: 'Beef', sortOrder: 0 }] }] },
    }))
    const optionId = initial.courses[0].options[0].id

    // Rename the option, supplying its id
    const renamed = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: {
        courses: [{
          id: initial.courses[0].id,
          name: 'First',
          sortOrder: 0,
          options: [{ id: optionId, name: 'Beef Wellington', sortOrder: 0 }],
        }],
      },
    }))
    expect(renamed.courses[0].options[0].id).toBe(optionId)
    expect(renamed.courses[0].options[0].name).toBe('Beef Wellington')
  })

  it('rejects an empty courses array (400)', async () => {
    await expect(putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) }, body: { courses: [] },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a course with no options (400)', async () => {
    await expect(putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: { courses: [{ name: 'First', sortOrder: 0, options: [] }] },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects when user does not own event (404)', async () => {
    const otherUser = await createTestUser(testDb, { email: 'other@example.com' })
    currentUserId = otherUser.id
    await expect(putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: { courses: [{ name: 'First', sortOrder: 0, options: [{ name: 'A', sortOrder: 0 }] }] },
    }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('removes a deleted course and cascades its options', async () => {
    const initial = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: {
        courses: [
          { name: 'A', sortOrder: 0, options: [{ name: 'a1', sortOrder: 0 }] },
          { name: 'B', sortOrder: 1, options: [{ name: 'b1', sortOrder: 0 }] },
        ],
      },
    }))
    const keepCourseId = initial.courses[0].id
    const keepOptionId = initial.courses[0].options[0].id

    const after = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: {
        courses: [
          { id: keepCourseId, name: 'A', sortOrder: 0, options: [{ id: keepOptionId, name: 'a1', sortOrder: 0 }] },
        ],
      },
    }))
    expect(after.courses).toHaveLength(1)

    // Verify physical deletion
    const allCourses = testDb.select().from(menuCourses).all()
    const allOptions = testDb.select().from(menuOptions).all()
    expect(allCourses).toHaveLength(1)
    expect(allOptions).toHaveLength(1)
  })

  it('rejects duplicate course ids (400)', async () => {
    const initial = await putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: { courses: [{ name: 'A', sortOrder: 0, options: [{ name: 'a1', sortOrder: 0 }] }] },
    }))
    const courseId = initial.courses[0].id
    await expect(putMenuHandler(createMockEvent({
      method: 'PUT', params: { id: String(eventId) },
      body: {
        courses: [
          { id: courseId, name: 'A', sortOrder: 0, options: [{ name: 'a1', sortOrder: 0 }] },
          { id: courseId, name: 'B', sortOrder: 1, options: [{ name: 'b1', sortOrder: 0 }] },
        ],
      },
    }))).rejects.toMatchObject({ statusCode: 400 })
  })
})
