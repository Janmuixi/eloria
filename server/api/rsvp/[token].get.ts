import { db } from '~/server/db'
import { guests, menuCourses, menuOptions, guestMenuChoices, companions } from '~/server/db/schema'
import { eq, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
    with: { event: true },
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const allergiesEnabled = guest.event?.allergiesEnabled === true

  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, guest.eventId),
    orderBy: [asc(menuCourses.sortOrder), asc(menuCourses.id)],
    with: { options: { orderBy: [asc(menuOptions.sortOrder), asc(menuOptions.id)] } },
  })
  const menu = courses.length === 0 ? null : {
    courses: courses.map(c => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      options: c.options.map(o => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
    })),
  }

  const companionRows = await db.query.companions.findMany({
    where: eq(companions.guestId, guest.id),
    orderBy: [asc(companions.position)],
  })

  const allChoices = menu === null ? [] : await db.query.guestMenuChoices.findMany({
    where: eq(guestMenuChoices.guestId, guest.id),
  })

  const selfChoices: Record<number, number> = {}
  const choicesByCompanion = new Map<number, Record<number, number>>()
  for (const ch of allChoices) {
    if (ch.optionId == null) continue
    if (ch.companionId == null) selfChoices[ch.courseId] = ch.optionId
    else {
      if (!choicesByCompanion.has(ch.companionId)) choicesByCompanion.set(ch.companionId, {})
      choicesByCompanion.get(ch.companionId)![ch.courseId] = ch.optionId
    }
  }

  // Synthesize a full N-entry array, merging stored rows where present
  const stored = new Map<number, typeof companionRows[number]>()
  for (const c of companionRows) stored.set(c.position, c)
  const companionsOut = []
  for (let pos = 1; pos <= guest.companionsAllowed; pos++) {
    const c = stored.get(pos)
    companionsOut.push({
      position: pos,
      name: c?.name ?? null,
      attending: c?.attending ?? false,
      menuChoices: c ? (choicesByCompanion.get(c.id) ?? {}) : {},
      allergies: allergiesEnabled && c ? parseAllergies(c.allergies) : null,
    })
  }

  return {
    name: guest.name,
    rsvpStatus: guest.rsvpStatus,
    companionsAllowed: guest.companionsAllowed,
    companions: companionsOut,
    menu,
    choices: selfChoices,
    allergiesEnabled,
    allergies: allergiesEnabled ? parseAllergies(guest.allergies) : null,
  }
})
