import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, tiers } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { hasActiveSubscription } from '~/server/utils/subscription'

function generateSlug(name1: string, name2: string): string {
  const base = `${name1}-and-${name2}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).substring(2, 6)
  return `${base}-${suffix}`
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { title, coupleName1, coupleName2, date, venue, venueAddress, venueMapUrl, description } = body

  if (!title || !coupleName1 || !coupleName2 || !date || !venue || !venueAddress) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  const slug = generateSlug(coupleName1, coupleName2)

  const isSubscriber = await hasActiveSubscription(user.id)

  const premiumTier = await db.query.tiers.findFirst({
    where: eq(tiers.slug, 'premium'),
  })

  const eventData: Record<string, unknown> = {
    userId: user.id,
    title,
    coupleName1,
    coupleName2,
    date,
    venue,
    venueAddress,
    venueMapUrl: venueMapUrl || null,
    description: description || null,
    slug,
  }

  if (isSubscriber && premiumTier) {
    eventData.paymentStatus = 'paid'
    eventData.tierId = premiumTier.id
  }

  const [newEvent] = await db.insert(events).values(eventData).returning()

  return newEvent
})
