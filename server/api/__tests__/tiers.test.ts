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
      seedTiers(testDb).run()

      const event = createMockEvent()

      const result = await handler(event)

      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('Basic')
      expect(result[0].sortOrder).toBe(1)
      expect(result[1].name).toBe('Premium')
      expect(result[1].sortOrder).toBe(2)
      expect(result[2].name).toBe('Pro')
      expect(result[2].sortOrder).toBe(3)
    })

    it('returns empty array when no tiers seeded', async () => {
      const event = createMockEvent()

      const result = await handler(event)

      expect(result).toEqual([])
    })
  })
})
