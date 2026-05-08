import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, companions } from '~/server/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { countSeats } from '~/server/utils/seats'

const COMPANION_MIN = 0
const COMPANION_MAX = 5

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const guestId = parseInt(getRouterParam(event, 'guestId')!)
  const body = await readBody(event)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    with: { tier: true },
  })
  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const guest = await db.query.guests.findFirst({
    where: and(eq(guests.id, guestId), eq(guests.eventId, id)),
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const raw = body?.companionsAllowed
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < COMPANION_MIN || raw > COMPANION_MAX) {
    throw createError({
      statusCode: 400,
      statusMessage: `companionsAllowed must be an integer between ${COMPANION_MIN} and ${COMPANION_MAX}`,
    })
  }

  const oldN = guest.companionsAllowed
  const newN = raw

  if (newN > oldN && evt.tier?.guestLimit != null) {
    const seats = await countSeats(id)
    if (seats - oldN + newN > evt.tier.guestLimit) {
      throw createError({
        statusCode: 403,
        statusMessage: `Seat limit reached for your plan (${evt.tier.guestLimit})`,
      })
    }
  }

  db.transaction((tx) => {
    tx.update(guests).set({ companionsAllowed: newN }).where(eq(guests.id, guestId)).run()
    if (newN < oldN) {
      tx.delete(companions)
        .where(and(eq(companions.guestId, guestId), gt(companions.position, newN)))
        .run()
    }
  })

  const updated = await db.query.guests.findFirst({ where: eq(guests.id, guestId) })
  return updated
})
