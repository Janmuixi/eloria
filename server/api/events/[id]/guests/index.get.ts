import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, guestMenuChoices } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const guestRows = await db.query.guests.findMany({
    where: eq(guests.eventId, id),
  })

  if (guestRows.length === 0) return []

  // Fetch all menu choices for guests of this event in one query
  const allChoices = await db.query.guestMenuChoices.findMany({
    where: (c, { inArray }) => inArray(c.guestId, guestRows.map(g => g.id)),
  })

  // Group choices by guestId
  const choicesByGuest = new Map<number, typeof allChoices>()
  for (const ch of allChoices) {
    if (!choicesByGuest.has(ch.guestId)) choicesByGuest.set(ch.guestId, [])
    choicesByGuest.get(ch.guestId)!.push(ch)
  }

  return guestRows.map(g => {
    const choices = choicesByGuest.get(g.id) ?? []
    const menuChoices: Record<number, number> = {}
    const plusOneMenuChoices: Record<number, number> = {}
    for (const ch of choices) {
      if (ch.optionId == null) continue
      if (ch.forPlusOne) plusOneMenuChoices[ch.courseId] = ch.optionId
      else menuChoices[ch.courseId] = ch.optionId
    }
    return {
      ...g,
      menuChoices,
      plusOneMenuChoices,
      allergies: parseAllergies(g.allergies),
      plusOneAllergies: parseAllergies(g.plusOneAllergies),
    }
  })
})
