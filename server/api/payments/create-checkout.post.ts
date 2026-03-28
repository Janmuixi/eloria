import Stripe from 'stripe'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, tiers } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const stripeKey = resolveEnvVar('STRIPE_SECRET_KEY')
  if (!stripeKey || stripeKey.startsWith('sk_test_...')) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe not configured' })
  }

  const stripe = new Stripe(stripeKey)
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { eventId, tierSlug } = body

  const userEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, user.id)),
  })

  if (!userEvent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const tier = await db.query.tiers.findFirst({
    where: eq(tiers.slug, tierSlug),
  })

  if (!tier) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid tier' })
  }

  // Update event with selected tier
  await db.update(events).set({ tierId: tier.id }).where(eq(events.id, eventId))

  const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Eloria ${tier.name} - ${userEvent.title}`,
          description: `Wedding invitation for ${userEvent.coupleName1} & ${userEvent.coupleName2}`,
        },
        unit_amount: tier.price,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${baseUrl}/dashboard/events/${eventId}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard/events/new?step=5&eventId=${eventId}`,
    metadata: { eventId: eventId.toString(), tierId: tier.id.toString() },
  })

  return { url: session.url }
})
