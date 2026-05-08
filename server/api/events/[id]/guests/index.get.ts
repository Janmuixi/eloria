import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, guestMenuChoices, companions } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'
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

  const guestIds = guestRows.map(g => g.id)

  const allChoices = await db.query.guestMenuChoices.findMany({
    where: (c, { inArray }) => inArray(c.guestId, guestIds),
  })

  const allCompanions = await db.query.companions.findMany({
    where: (c, { inArray }) => inArray(c.guestId, guestIds),
    orderBy: [asc(companions.position)],
  })

  // Group by guest
  const choicesByGuest = new Map<number, typeof allChoices>()
  for (const ch of allChoices) {
    if (!choicesByGuest.has(ch.guestId)) choicesByGuest.set(ch.guestId, [])
    choicesByGuest.get(ch.guestId)!.push(ch)
  }
  const companionsByGuest = new Map<number, typeof allCompanions>()
  for (const c of allCompanions) {
    if (!companionsByGuest.has(c.guestId)) companionsByGuest.set(c.guestId, [])
    companionsByGuest.get(c.guestId)!.push(c)
  }

  return guestRows.map(g => {
    const choices = choicesByGuest.get(g.id) ?? []
    const menuChoices: Record<number, number> = {}
    const choicesByCompanion = new Map<number, Record<number, number>>()
    for (const ch of choices) {
      if (ch.optionId == null) continue
      if (ch.companionId == null) {
        menuChoices[ch.courseId] = ch.optionId
      } else {
        if (!choicesByCompanion.has(ch.companionId)) choicesByCompanion.set(ch.companionId, {})
        choicesByCompanion.get(ch.companionId)![ch.courseId] = ch.optionId
      }
    }

    const compRows = companionsByGuest.get(g.id) ?? []
    const companionsOut = compRows.map(c => ({
      id: c.id,
      position: c.position,
      name: c.name,
      attending: c.attending,
      menuChoices: choicesByCompanion.get(c.id) ?? {},
      allergies: parseAllergies(c.allergies),
    }))

    return {
      ...g,
      menuChoices,
      allergies: parseAllergies(g.allergies),
      companions: companionsOut,
    }
  })
})
