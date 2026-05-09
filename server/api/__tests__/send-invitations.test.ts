import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
  createTestGuest,
  seedTiers,
  seedTemplate,
  type TestDb,
} from '../../__helpers__/db'
import { guests } from '../../db/schema'
import { eq } from 'drizzle-orm'
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

  it('with guestIds in body: sends to those guests even if emailSentAt is set (resend path)', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    const { sendInvitationEmail } = await import('~/server/utils/email')
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'resend@test.com', name: 'R' })
    const template = seedTemplate(testDb, 2)
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })
    const alreadySent = createTestGuest(testDb, evt!.id, { name: 'Already', email: 'a@x.com' })
    testDb.update(guests).set({ emailSentAt: '2026-04-01T00:00:00.000Z' }).where(eq(guests.id, alreadySent!.id)).run()

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
      body: { guestIds: [alreadySent!.id] },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1)
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.com' }))
  })

  it('with guestIds in body: ignores ids that belong to another event', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    const { sendInvitationEmail } = await import('~/server/utils/email')
    ;(sendInvitationEmail as any).mockClear()
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'cross@test.com', name: 'X' })
    const template = seedTemplate(testDb, 2)
    const evtA = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
      slug: 'a-event',
    })
    const evtB = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
      slug: 'b-event',
    })
    const guestInB = createTestGuest(testDb, evtB!.id, { name: 'Other', email: 'b@x.com' })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evtA!.id) },
      body: { guestIds: [guestInB!.id] },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 0, failed: 0 })
    expect(sendInvitationEmail).not.toHaveBeenCalled()
  })

  it('with guestIds in body: skips guests that have no email', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    const { sendInvitationEmail } = await import('~/server/utils/email')
    ;(sendInvitationEmail as any).mockClear()
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'noemail@test.com', name: 'N' })
    const template = seedTemplate(testDb, 2)
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })
    const noEmailGuest = createTestGuest(testDb, evt!.id, { name: 'NoEmail', email: null })
    testDb.update(guests).set({ email: null }).where(eq(guests.id, noEmailGuest!.id)).run()

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
      body: { guestIds: [noEmailGuest!.id] },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 0, failed: 0 })
    expect(sendInvitationEmail).not.toHaveBeenCalled()
  })

  it('with empty guestIds array in body: behaves as no-guestIds (uninvited path)', async () => {
    vi.resetModules()
    const handler = (await import('../events/[id]/send-invitations.post')).default
    const { sendInvitationEmail } = await import('~/server/utils/email')
    ;(sendInvitationEmail as any).mockClear()
    seedTiers(testDb)
    const user = await createTestUser(testDb, { email: 'empty@test.com', name: 'E' })
    const template = seedTemplate(testDb, 2)
    const evt = createTestEvent(testDb, user!.id, {
      paymentStatus: 'paid',
      tierId: 2,
      templateId: template!.id,
    })
    const fresh = createTestGuest(testDb, evt!.id, { name: 'Fresh', email: 'f@x.com' })

    const event = authEvent(user!.id, user!.email, {
      method: 'POST',
      params: { id: String(evt!.id) },
      body: { guestIds: [] },
    })

    const result = await handler(event)
    expect(result).toMatchObject({ sent: 1, failed: 0 })
    expect(sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'f@x.com' }))
  })
})
