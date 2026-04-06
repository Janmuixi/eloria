import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    with: { tier: true },
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Guest name is required' })
  }

  // Enforce guest limit if tier is assigned and has a limit
  if (evt.tier?.guestLimit != null) {
    const [{ value: currentCount }] = await db
      .select({ value: count() })
      .from(guests)
      .where(eq(guests.eventId, id))

    if (currentCount >= evt.tier.guestLimit) {
      throw createError({
        statusCode: 403,
        statusMessage: `Guest limit reached for your plan (${evt.tier.guestLimit})`,
      })
    }
  }

  const [guest] = await db.insert(guests).values({
    eventId: id,
    name: body.name.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    token: crypto.randomUUID(),
  }).returning()

  return guest
})
