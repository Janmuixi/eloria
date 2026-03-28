import Stripe from 'stripe'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
  const webhookSecret = resolveEnvVar('STRIPE_WEBHOOK_SECRET')

  if (!stripeKey || !webhookSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe not configured' })
  }

  const stripe = new Stripe(stripeKey)
  const body = await readRawBody(event)
  const signature = getHeader(event, 'stripe-signature')

  if (!body || !signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing body or signature' })
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid signature' })
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session
    const eventId = parseInt(session.metadata?.eventId || '0')
    const tierId = parseInt(session.metadata?.tierId || '0')

    if (eventId && tierId) {
      await db.update(events).set({
        paymentStatus: 'paid',
        stripePaymentId: session.payment_intent as string,
        tierId,
      }).where(eq(events.id, eventId))
    }
  }

  return { received: true }
})
