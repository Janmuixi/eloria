import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Slug required' })

  const evt = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: { template: true, tier: true },
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  if (evt.paymentStatus !== 'paid') throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  return {
    coupleName1: evt.coupleName1,
    coupleName2: evt.coupleName2,
    date: evt.date,
    venue: evt.venue,
    venueAddress: evt.venueAddress,
    venueMapUrl: evt.venueMapUrl,
    description: evt.description,
    customization: evt.customization ? JSON.parse(evt.customization) : null,
    template: evt.template,
    removeBranding: evt.tier?.removeBranding || false,
  }
})
