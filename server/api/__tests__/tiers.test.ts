import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
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

const handler = (await import('../tiers/index.get')).default

describe('Tiers API', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  describe('GET /api/tiers', () => {
    it('lists tiers in sort order', async () => {
      seedTiers(testDb)

      const event = createMockEvent()

      const result = await handler(event)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Basic')
      expect(result[0].sortOrder).toBe(1)
      expect(result[1].name).toBe('Premium')
      expect(result[1].sortOrder).toBe(2)
    })

    it('returns correct Premium tier features', async () => {
      seedTiers(testDb)

      const event = createMockEvent()

      const result = await handler(event)
      const premium = result[1]

      expect(premium.price).toBe(3500)
      expect(premium.guestLimit).toBeNull()
      expect(premium.hasEmailDelivery).toBe(true)
      expect(premium.hasPdfExport).toBe(true)
      expect(premium.hasAiTextGeneration).toBe(true)
      expect(premium.removeBranding).toBe(true)
      expect(premium.hasMultipleVariants).toBe(true)
    })

    it('returns empty array when no tiers seeded', async () => {
      const event = createMockEvent()

      const result = await handler(event)

      expect(result).toEqual([])
    })
  })
})
