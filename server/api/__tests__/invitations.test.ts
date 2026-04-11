import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  seedTiers,
  seedTemplate,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const handler = (await import('../invitations/[slug].get')).default

describe('Invitations API', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  describe('GET /api/invitations/:slug', () => {
    it('returns paid invitation data with template', async () => {
      seedTiers(testDb)
      const user = await createTestUser(testDb, { email: 'inv@test.com', name: 'Inviter' })
      // Premium tier is id=2 (second seeded tier), has removeBranding: true
      const template = seedTemplate(testDb, 2)
      const evt = createTestEvent(testDb, user!.id, {
        slug: 'alice-and-bob-1234',
        paymentStatus: 'paid',
        tierId: 2,
        templateId: template!.id,
      })

      const event = createMockEvent({
        params: { slug: 'alice-and-bob-1234' },
      })

      const result = await handler(event)

      expect(result.coupleName1).toBe('Alice')
      expect(result.coupleName2).toBe('Bob')
      expect(result.date).toBe('2026-06-15')
      expect(result.venue).toBe('Grand Hotel')
      expect(result.venueAddress).toBe('123 Main St')
      expect(result.template).toBeDefined()
      expect(result.template!.name).toBe('Test Template')
      expect(result.removeBranding).toBe(true)
    })

    it('rejects unpaid event (404)', async () => {
      const user = await createTestUser(testDb, { email: 'unpaid@test.com', name: 'Unpaid' })
      createTestEvent(testDb, user!.id, {
        slug: 'unpaid-event',
        paymentStatus: 'pending',
      })

      const event = createMockEvent({
        params: { slug: 'unpaid-event' },
      })

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('rejects nonexistent slug (404)', async () => {
      const event = createMockEvent({
        params: { slug: 'does-not-exist' },
      })

      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })
})
