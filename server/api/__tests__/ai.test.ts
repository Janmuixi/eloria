import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
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

const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    this.chat = { completions: { create: mockCreate } }
  }),
}))

const generateWordingHandler = (await import('../ai/generate-wording.post')).default
const recommendTemplatesHandler = (await import('../ai/recommend-templates.post')).default

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

beforeEach(() => {
  mockCreate.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI API', () => {
  const originalEnv = process.env

  beforeEach(async () => {
    testDb = createTestDb()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('POST /api/ai/generate-wording', () => {
    it('returns 3 fallback variations when no OPENAI_API_KEY', async () => {
      delete process.env.OPENAI_API_KEY
      vi.resetModules()
      const handler = (await import('../ai/generate-wording.post')).default
      const user = await createTestUser(testDb, { email: 'ai@test.com' })

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: {
          coupleName1: 'Alice',
          coupleName2: 'Bob',
          date: '2026-06-15',
          venue: 'Grand Hotel',
          tone: 'formal',
        },
      })

      const result = await handler(event)

      expect(result.variations).toHaveLength(3)
      expect(result.variations[0]).toContain('Alice')
      expect(result.variations[0]).toContain('Bob')
      expect(result.variations[0]).toContain('2026-06-15')
      expect(result.variations[0]).toContain('Grand Hotel')
    })

    it('calls OpenAI when key is configured', async () => {
      process.env.OPENAI_API_KEY = 'sk-real-key'
      vi.resetModules()
      const handler = (await import('../ai/generate-wording.post')).default
      const user = await createTestUser(testDb, { email: 'ai2@test.com' })

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                variations: [
                  'AI variation 1',
                  'AI variation 2',
                  'AI variation 3',
                ],
              }),
            },
          },
        ],
      })

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: {
          coupleName1: 'Alice',
          coupleName2: 'Bob',
          date: '2026-06-15',
          venue: 'Grand Hotel',
          tone: 'romantic',
        },
      })

      const result = await handler(event)

      expect(mockCreate).toHaveBeenCalledOnce()
      expect(result.variations).toHaveLength(3)
      expect(result.variations[0]).toBe('AI variation 1')
    })

    it('rejects unauthenticated request (401)', async () => {
      const event = createMockEvent({
        method: 'POST',
        body: {
          coupleName1: 'Alice',
          coupleName2: 'Bob',
          date: '2026-06-15',
          venue: 'Grand Hotel',
        },
      })

      await expect(generateWordingHandler(event)).rejects.toMatchObject({
        statusCode: 401,
      })
    })
  })

  describe('POST /api/ai/recommend-templates', () => {
    it('returns fallback recommendations when no API key', async () => {
      delete process.env.OPENAI_API_KEY
      vi.resetModules()
      const handler = (await import('../ai/recommend-templates.post')).default
      seedTiers(testDb)
      seedTemplate(testDb, 1)
      seedTemplate(testDb, 2)

      const user = await createTestUser(testDb, { email: 'rec@test.com' })

      const event = authEvent(user.id, user.email, {
        method: 'POST',
        body: {
          coupleName1: 'Alice',
          coupleName2: 'Bob',
          venue: 'Grand Hotel',
          date: '2026-06-15',
          description: 'classic and elegant',
        },
      })

      const result = await handler(event)

      expect(result.recommended).toBeDefined()
      expect(result.all).toBeDefined()
      expect(result.all).toHaveLength(2)
      expect(result.recommended.length).toBeLessThanOrEqual(5)
      expect(result.recommended.length).toBeGreaterThan(0)
    })
  })
})
