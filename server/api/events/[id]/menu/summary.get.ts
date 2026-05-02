import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, guestMenuChoices, menuCourses, menuOptions } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { parseAllergies } from '~/server/utils/menu-validation'
import type { AllergenKey } from '~/shared/menu'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    columns: { id: true },
  })
  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, id),
    orderBy: [asc(menuCourses.sortOrder), asc(menuCourses.id)],
    with: {
      options: { orderBy: [asc(menuOptions.sortOrder), asc(menuOptions.id)] },
    },
  })

  const confirmedGuests = await db.query.guests.findMany({
    where: and(eq(guests.eventId, id), eq(guests.rsvpStatus, 'confirmed')),
  })

  const choices = confirmedGuests.length === 0 ? [] : await db.query.guestMenuChoices.findMany({
    where: (c, { inArray }) => inArray(c.guestId, confirmedGuests.map(g => g.id)),
  })

  // Per-course aggregation
  const courseOut = courses.map(course => {
    const optCounts = new Map<number, number>()
    for (const opt of course.options) optCounts.set(opt.id, 0)

    // For "unpicked" we count confirmed guests (and their plus-ones if any) who have NO row for this course
    const haveSelfPick = new Set<number>()
    const haveP1Pick = new Set<number>()
    for (const ch of choices) {
      if (ch.courseId !== course.id) continue
      if (ch.optionId != null && optCounts.has(ch.optionId)) {
        optCounts.set(ch.optionId, optCounts.get(ch.optionId)! + 1)
      }
      if (ch.forPlusOne) haveP1Pick.add(ch.guestId)
      else haveSelfPick.add(ch.guestId)
    }
    let unpicked = 0
    for (const g of confirmedGuests) {
      if (!haveSelfPick.has(g.id)) unpicked++
      if (g.plusOne && !haveP1Pick.has(g.id)) unpicked++
    }
    return {
      id: course.id,
      name: course.name,
      options: course.options.map(o => ({ id: o.id, name: o.name, count: optCounts.get(o.id) ?? 0 })),
      unpickedConfirmedGuests: unpicked,
    }
  })

  // Allergies
  const keyCounts: Partial<Record<AllergenKey, number>> = {}
  const otherMap = new Map<string, number>()
  for (const g of confirmedGuests) {
    const own = parseAllergies(g.allergies)
    if (own) {
      for (const k of own.keys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
      if (own.other) otherMap.set(own.other, (otherMap.get(own.other) ?? 0) + 1)
    }
    if (g.plusOne) {
      const p1 = parseAllergies(g.plusOneAllergies)
      if (p1) {
        for (const k of p1.keys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
        if (p1.other) otherMap.set(p1.other, (otherMap.get(p1.other) ?? 0) + 1)
      }
    }
  }

  return {
    courses: courseOut,
    allergies: {
      keys: keyCounts as Record<string, number>,
      other: Array.from(otherMap.entries()).map(([text, count]) => ({ text, count })),
    },
  }
})
