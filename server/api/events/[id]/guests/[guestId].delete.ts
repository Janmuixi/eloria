import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const guestId = parseInt(getRouterParam(event, 'guestId')!)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const guest = await db.query.guests.findFirst({
    where: and(eq(guests.id, guestId), eq(guests.eventId, id)),
  })

  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  await db.delete(guests).where(eq(guests.id, guestId))

  return { success: true }
})
