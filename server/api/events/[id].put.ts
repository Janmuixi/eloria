import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)

  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  const [updated] = await db.update(events)
    .set({
      templateId: body.templateId ?? existing.templateId,
      customization: body.customization ?? existing.customization,
      tierId: body.tierId ?? existing.tierId,
      title: body.title ?? existing.title,
      coupleName1: body.coupleName1 ?? existing.coupleName1,
      coupleName2: body.coupleName2 ?? existing.coupleName2,
      date: body.date ?? existing.date,
      venue: body.venue ?? existing.venue,
      venueAddress: body.venueAddress ?? existing.venueAddress,
      venueMapUrl: body.venueMapUrl ?? existing.venueMapUrl,
      description: body.description ?? existing.description,
    })
    .where(and(eq(events.id, id), eq(events.userId, user.id)))
    .returning()

  return updated
})
