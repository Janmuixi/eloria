import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  // Delete guests first (foreign key)
  await db.delete(guests).where(eq(guests.eventId, id))

  // Delete the event
  await db.delete(events).where(and(eq(events.id, id), eq(events.userId, user.id)))

  return { success: true }
})
