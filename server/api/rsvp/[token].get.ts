import { db } from '~/server/db'
import { guests } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
  })

  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  return {
    name: guest.name,
    rsvpStatus: guest.rsvpStatus,
    plusOne: guest.plusOne,
    plusOneName: guest.plusOneName,
  }
})
