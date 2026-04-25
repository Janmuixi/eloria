import Stripe from 'stripe'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
  if (!stripeKey || stripeKey.startsWith('sk_test_...')) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe not configured' })
  }

  const stripe = new Stripe(stripeKey)
  const user = await requireAuth(event)

  let customerId = user.stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id.toString() },
    })
    customerId = customer.id
    await db.update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, user.id))
  }

  const body = await readBody(event).catch(() => ({}))
  const eventId = body?.eventId ? parseInt(body.eventId) : null

  const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
  const successUrl = eventId
    ? `${baseUrl}/dashboard/events/${eventId}?subscription=success`
    : `${baseUrl}/dashboard?subscription=success`

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: 'Eloria Pro - Wedding Planner Subscription',
          description: 'Unlimited event creation with all Premium features',
        },
        unit_amount: 4900,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    mode: 'subscription',
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: `${baseUrl}/pricing`,
    metadata: { userId: user.id.toString(), ...(eventId ? { eventId: eventId.toString() } : {}) },
  })

  return { url: session.url }
})
