import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createTestDb,
  createTestUser,
  createTestEvent,
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

const mockCheckoutCreate = vi.fn().mockResolvedValue({
  url: 'https://checkout.stripe.com/test',
  id: 'cs_test_123',
})
const mockSessionRetrieve = vi.fn()
const mockConstructEvent = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function (this: any) {
    this.checkout = {
      sessions: { create: mockCheckoutCreate, retrieve: mockSessionRetrieve },
    }
    this.webhooks = { constructEvent: mockConstructEvent }
  }),
}))

vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({
  STRIPE_SECRET_KEY: 'sk_test_real_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  BASE_URL: 'http://localhost:3000',
})))

const createCheckoutHandler = (await import('../payments/create-checkout.post')).default
const verifyHandler = (await import('../payments/verify.post')).default
const webhookHandler = (await import('../payments/webhook.post')).default

const { createToken } = await import('../../utils/auth')

function authEvent(userId: number, email: string, overrides?: Parameters<typeof createMockEvent>[0]) {
  const token = createToken({ userId, email })
  return createMockEvent({ ...overrides, cookies: { auth_token: token } })
}

describe('Payments API', () => {
  beforeEach(() => {
    testDb = createTestDb()
    mockCheckoutCreate.mockClear()
    mockSessionRetrieve.mockClear()
    mockConstructEvent.mockClear()
  })

  describe('POST /api/payments/create-checkout', () => {
    it('creates a Stripe checkout session', async () => {
      seedTiers(testDb).run()
      const user = await createTestUser(testDb, { email: 'pay@test.com', name: 'Payer' })
      const evt = createTestEvent(testDb, user!.id, { title: 'Pay Wedding' })

      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: { eventId: evt!.id, tierSlug: 'premium' },
      })

      const result = await createCheckoutHandler(event)

      expect(result).toEqual({ url: 'https://checkout.stripe.com/test' })
      expect(mockCheckoutCreate).toHaveBeenCalledOnce()
      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          metadata: expect.objectContaining({
            eventId: evt!.id.toString(),
          }),
        }),
      )
    })

    it('rejects nonexistent event (404)', async () => {
      seedTiers(testDb).run()
      const user = await createTestUser(testDb, { email: 'noevt@test.com', name: 'NoEvent' })

      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: { eventId: 99999, tierSlug: 'premium' },
      })

      await expect(createCheckoutHandler(event)).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('rejects invalid tier slug (400)', async () => {
      seedTiers(testDb).run()
      const user = await createTestUser(testDb, { email: 'badtier@test.com', name: 'BadTier' })
      const evt = createTestEvent(testDb, user!.id, { title: 'Bad Tier Wedding' })

      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: { eventId: evt!.id, tierSlug: 'nonexistent-tier' },
      })

      await expect(createCheckoutHandler(event)).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })

  describe('POST /api/payments/verify', () => {
    it('marks event as paid when Stripe confirms', async () => {
      seedTiers(testDb).run()
      const user = await createTestUser(testDb, { email: 'verify@test.com', name: 'Verifier' })
      const evt = createTestEvent(testDb, user!.id, {
        title: 'Verify Wedding',
        paymentStatus: 'pending',
      })

      mockSessionRetrieve.mockResolvedValue({
        payment_status: 'paid',
        payment_intent: 'pi_test_123',
        metadata: {
          eventId: evt!.id.toString(),
          tierId: '2',
        },
      })

      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: { sessionId: 'cs_test_123', eventId: evt!.id },
      })

      const result = await verifyHandler(event)

      expect(result).toEqual({ status: 'paid' })
      expect(mockSessionRetrieve).toHaveBeenCalledWith('cs_test_123')

      // Verify DB was updated
      const { events } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')
      const updated = testDb.select().from(events).where(eq(events.id, evt!.id)).all()
      expect(updated[0]!.paymentStatus).toBe('paid')
      expect(updated[0]!.stripePaymentId).toBe('pi_test_123')
    })

    it('returns existing paid status without calling Stripe', async () => {
      const user = await createTestUser(testDb, { email: 'already@test.com', name: 'Already' })
      const evt = createTestEvent(testDb, user!.id, {
        title: 'Already Paid',
        paymentStatus: 'paid',
      })

      const event = authEvent(user!.id, user!.email, {
        method: 'POST',
        body: { sessionId: 'cs_test_456', eventId: evt!.id },
      })

      const result = await verifyHandler(event)

      expect(result).toEqual({ status: 'paid' })
      expect(mockSessionRetrieve).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/payments/webhook', () => {
    it('processes checkout.session.completed event', async () => {
      seedTiers(testDb).run()
      const user = await createTestUser(testDb, { email: 'hook@test.com', name: 'Hooker' })
      const evt = createTestEvent(testDb, user!.id, {
        title: 'Webhook Wedding',
        paymentStatus: 'pending',
      })

      const stripeEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            payment_intent: 'pi_webhook_123',
            metadata: {
              eventId: evt!.id.toString(),
              tierId: '2',
            },
          },
        },
      }

      mockConstructEvent.mockReturnValue(stripeEvent)

      const rawBody = JSON.stringify(stripeEvent)

      // Create a mock event with raw body for readRawBody.
      // readRawBody checks event._requestBody first — set it to the raw string
      // (not a parsed object) so it returns the raw body directly.
      const event = createMockEvent({
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test_123',
          'content-type': 'application/json',
        },
      })
      ;(event as any)._requestBody = rawBody

      const result = await webhookHandler(event)

      expect(result).toEqual({ received: true })
      expect(mockConstructEvent).toHaveBeenCalledWith(
        rawBody,
        'sig_test_123',
        'whsec_test',
      )

      // Verify DB was updated
      const { events } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')
      const updated = testDb.select().from(events).where(eq(events.id, evt!.id)).all()
      expect(updated[0]!.paymentStatus).toBe('paid')
      expect(updated[0]!.stripePaymentId).toBe('pi_webhook_123')
    })
  })
})
