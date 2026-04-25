import { db } from '~/server/db'
import { guests } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const body = await readBody(event)
  const { rsvpStatus, plusOne, plusOneName } = body

  if (!['confirmed', 'declined'].includes(rsvpStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid RSVP status' })
  }

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
  })

  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const [updated] = await db.update(guests).set({
    rsvpStatus,
    plusOne: plusOne || false,
    plusOneName: plusOne ? plusOneName : null,
  }).where(eq(guests.token, token)).returning()

  return { success: true, rsvpStatus: updated.rsvpStatus }
})
