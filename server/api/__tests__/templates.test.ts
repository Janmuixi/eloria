import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  seedTiers,
  type TestDb,
} from '../../__helpers__/db'
import { createMockEvent } from '../../__helpers__/event'
import { templates } from '../../db/schema'

let testDb: TestDb

vi.mock('~/server/db', () => ({
  get db() {
    return testDb
  },
}))

const handler = (await import('../templates/index.get')).default

describe('Templates API', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  describe('GET /api/templates', () => {
    it('lists all templates with tier relation', async () => {
      seedTiers(testDb)
      testDb.insert(templates).values([
        {
          name: 'Classic Elegance',
          slug: 'classic-elegance',
          category: 'classic',
          previewImageUrl: '/classic.png',
          htmlTemplate: '<div>Classic</div>',
          cssTemplate: 'body {}',
          colorScheme: '{"primary":"#000"}',
          fontPairings: '{"heading":"serif"}',
          tags: '["classic"]',
          minimumTierId: 1,
        },
        {
          name: 'Modern Vibes',
          slug: 'modern-vibes',
          category: 'modern',
          previewImageUrl: '/modern.png',
          htmlTemplate: '<div>Modern</div>',
          cssTemplate: 'body {}',
          colorScheme: '{"primary":"#fff"}',
          fontPairings: '{"heading":"sans-serif"}',
          tags: '["modern"]',
          minimumTierId: 2,
        },
      ]).run()

      const event = createMockEvent()

      const result = await handler(event)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Classic Elegance')
      expect(result[0].tier).toBeDefined()
      expect(result[0].tier.name).toBe('Basic')
      expect(result[1].name).toBe('Modern Vibes')
      expect(result[1].tier).toBeDefined()
      expect(result[1].tier.name).toBe('Premium')
    })

    it('filters by category', async () => {
      seedTiers(testDb)
      testDb.insert(templates).values([
        {
          name: 'Classic Elegance',
          slug: 'classic-elegance',
          category: 'classic',
          previewImageUrl: '/classic.png',
          htmlTemplate: '<div>Classic</div>',
          cssTemplate: 'body {}',
          colorScheme: '{"primary":"#000"}',
          fontPairings: '{"heading":"serif"}',
          tags: '["classic"]',
          minimumTierId: 1,
        },
        {
          name: 'Modern Vibes',
          slug: 'modern-vibes',
          category: 'modern',
          previewImageUrl: '/modern.png',
          htmlTemplate: '<div>Modern</div>',
          cssTemplate: 'body {}',
          colorScheme: '{"primary":"#fff"}',
          fontPairings: '{"heading":"sans-serif"}',
          tags: '["modern"]',
          minimumTierId: 2,
        },
      ]).run()

      const event = createMockEvent({
        url: '/api/templates?category=modern',
      })

      const result = await handler(event)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Modern Vibes')
      expect(result[0].category).toBe('modern')
    })

    it('returns empty array when no templates', async () => {
      const event = createMockEvent()

      const result = await handler(event)

      expect(result).toEqual([])
    })
  })
})
