import Stripe from 'stripe'
import { db } from '~/server/db'
import { subscriptions, events, tiers } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
  const webhookSecret = resolveEnvVar('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET')

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
    const userId = parseInt(session.metadata?.userId || '0')

    if (userId && session.subscription && session.customer) {
      const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription as string)
      const item = stripeSubscription.items.data[0] as unknown as Stripe.SubscriptionItem & { current_period_start: number; current_period_end: number }
      const periodStart = new Date(item.current_period_start * 1000).toISOString()
      const periodEnd = new Date(item.current_period_end * 1000).toISOString()

      await db.insert(subscriptions).values({
        userId,
        stripeSubscriptionId: session.subscription as string,
        stripeCustomerId: session.customer as string,
        status: stripeSubscription.status,
        price: item.price.unit_amount || 4900,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      }).onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          status: stripeSubscription.status,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      })

      // If subscription was started from event creation wizard, mark that event as paid
      const eventId = session.metadata?.eventId ? parseInt(session.metadata.eventId) : null
      if (eventId) {
        const premiumTier = await db.query.tiers.findFirst({ where: eq(tiers.slug, 'premium') })
        if (premiumTier) {
          await db.update(events)
            .set({ paymentStatus: 'paid', tierId: premiumTier.id })
            .where(eq(events.id, eventId))
        }
      }
    }
  }

  if (stripeEvent.type === 'customer.subscription.updated') {
    const sub = stripeEvent.data.object as Stripe.Subscription
    const item = sub.items.data[0] as unknown as Stripe.SubscriptionItem & { current_period_start: number; current_period_end: number }
    await db.update(subscriptions)
      .set({
        status: sub.status,
        currentPeriodStart: new Date(item.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(item.current_period_end * 1000).toISOString(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
  }

  if (stripeEvent.type === 'customer.subscription.deleted') {
    const sub = stripeEvent.data.object as Stripe.Subscription

    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, sub.id),
    })

    if (subscription) {
      await db.update(subscriptions)
        .set({ status: 'expired', canceledAt: new Date().toISOString() })
        .where(eq(subscriptions.id, subscription.id))

      await db.update(events)
        .set({ paymentStatus: 'locked' })
        .where(eq(events.userId, subscription.userId))
    }
  }

  return { received: true }
})
