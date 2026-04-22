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

vi.mock('~/server/utils/email', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
}))

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('POST /api/events/[id]/send-invitations', () => {
  const originalEnv = process.env

  beforeEach(() => {
    testDb = createTestDb()
    process.env = { ...originalEnv, RESEND_API_KEY: 'test_key', BASE_URL: 'http://localhost:3000' }
  })

  it('rejects with 400 when the event has no template', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'guard@test.com', name: 'G' })
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2, // premium has hasEmailDelivery
      templateId: null,
    })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
    })

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringMatching(/template/i),
    })
  })

  it('proceeds when the event has a template (no guests → 0 sent)', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'ok@test.com', name: 'O' })
    const template = seedTemplate(testDb, 2)
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 0, failed: 0 })
  })
})
