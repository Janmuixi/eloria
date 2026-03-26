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

const getHandler = (await import('../../api/rsvp/[token].get')).default
const postHandler = (await import('../../api/rsvp/[token].post')).default

describe('RSVP API', () => {
  let guest: ReturnType<typeof createTestGuest>

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
    it('returns guest RSVP data', async () => {
      const event = createMockEvent({
        params: { token: 'valid-token-123' },
      })

      const result = await getHandler(event)

      expect(result).toEqual({
        name: 'Invitee',
        rsvpStatus: 'pending',
        plusOne: false,
        plusOneName: null,
      })
    })

    it('rejects invalid/nonexistent token (404)', async () => {
      const event = createMockEvent({
        params: { token: 'nonexistent-token' },
      })

      await expect(getHandler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
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
