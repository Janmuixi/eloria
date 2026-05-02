import { db } from '~/server/db'
import { guests, menuCourses, menuOptions, guestMenuChoices } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

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

  const myChoices = menu === null ? [] : await db.query.guestMenuChoices.findMany({
    where: eq(guestMenuChoices.guestId, guest.id),
  })
  const choices: Record<number, number> = {}
  const plusOneChoices: Record<number, number> = {}
  for (const ch of myChoices) {
    if (ch.optionId == null) continue
    if (ch.forPlusOne) plusOneChoices[ch.courseId] = ch.optionId
    else choices[ch.courseId] = ch.optionId
  }

  return {
    name: guest.name,
    rsvpStatus: guest.rsvpStatus,
    plusOne: guest.plusOne,
    plusOneName: guest.plusOneName,
    menu,
    choices,
    plusOneChoices,
    allergies: parseAllergies(guest.allergies),
    plusOneAllergies: parseAllergies(guest.plusOneAllergies),
  }
})
