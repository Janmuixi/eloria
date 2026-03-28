import Stripe from 'stripe'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
  if (!stripeKey || stripeKey.startsWith('sk_test_...')) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe not configured' })
  }

  const user = await requireAuth(event)
  const body = await readBody(event)
  const { sessionId, eventId } = body

  if (!sessionId || !eventId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sessionId or eventId' })
  }

  // Verify the event belongs to this user
  const userEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, user.id)),
  })

  if (!userEvent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  // Already paid — no need to check Stripe again
  if (userEvent.paymentStatus === 'paid') {
    return { status: 'paid' }
  }

  // Retrieve the checkout session from Stripe
  const stripe = new Stripe(stripeKey)
  const session = await stripe.checkout.sessions.retrieve(sessionId)

  // Verify the session metadata matches
  if (session.metadata?.eventId !== eventId.toString()) {
    throw createError({ statusCode: 400, statusMessage: 'Session does not match event' })
  }

  if (session.payment_status === 'paid') {
    await db.update(events).set({
      paymentStatus: 'paid',
      stripePaymentId: session.payment_intent as string,
      tierId: parseInt(session.metadata?.tierId || '0') || userEvent.tierId,
    }).where(eq(events.id, eventId))

    return { status: 'paid' }
  }

  return { status: session.payment_status }
})
