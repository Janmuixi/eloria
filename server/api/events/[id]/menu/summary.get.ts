import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests, guestMenuChoices, menuCourses, menuOptions, companions } from '~/server/db/schema'
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

  if (confirmedGuests.length === 0) {
    return {
      courses: courses.map(c => ({
        id: c.id, name: c.name,
        options: c.options.map(o => ({ id: o.id, name: o.name, count: 0 })),
        unpickedConfirmedGuests: 0,
      })),
      allergies: { keys: {}, other: [] },
    }
  }

  const guestIds = confirmedGuests.map(g => g.id)

  const attendingCompanions = await db.query.companions.findMany({
    where: (c, { inArray, eq: eqOp, and: andOp }) =>
      andOp(inArray(c.guestId, guestIds), eqOp(c.attending, true)),
  })
  const attendingCompanionIds = new Set(attendingCompanions.map(c => c.id))

  const choices = await db.query.guestMenuChoices.findMany({
    where: (c, { inArray }) => inArray(c.guestId, guestIds),
  })

  // Per-course aggregation
  const courseOut = courses.map(course => {
    const optCounts = new Map<number, number>()
    for (const opt of course.options) optCounts.set(opt.id, 0)

    const haveSelfPick = new Set<number>()
    const havePickByCompanionId = new Set<number>()

    for (const ch of choices) {
      if (ch.courseId !== course.id) continue
      // Companions that exist but are not attending: skip their picks entirely
      if (ch.companionId != null && !attendingCompanionIds.has(ch.companionId)) continue
      if (ch.optionId != null && optCounts.has(ch.optionId)) {
        optCounts.set(ch.optionId, optCounts.get(ch.optionId)! + 1)
      }
      if (ch.companionId == null) haveSelfPick.add(ch.guestId)
      else havePickByCompanionId.add(ch.companionId)
    }

    let unpicked = 0
    for (const g of confirmedGuests) {
      if (!haveSelfPick.has(g.id)) unpicked++
    }
    for (const c of attendingCompanions) {
      if (!havePickByCompanionId.has(c.id)) unpicked++
    }

    return {
      id: course.id,
      name: course.name,
      options: course.options.map(o => ({ id: o.id, name: o.name, count: optCounts.get(o.id) ?? 0 })),
      unpickedConfirmedGuests: unpicked,
    }
  })

  // Allergies — guests + attending companions only
  const keyCounts: Partial<Record<AllergenKey, number>> = {}
  const otherMap = new Map<string, number>()
  for (const g of confirmedGuests) {
    const own = parseAllergies(g.allergies)
    if (own) {
      for (const k of own.keys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
      if (own.other) otherMap.set(own.other, (otherMap.get(own.other) ?? 0) + 1)
    }
  }
  for (const c of attendingCompanions) {
    const a = parseAllergies(c.allergies)
    if (!a) continue
    for (const k of a.keys) keyCounts[k] = (keyCounts[k] ?? 0) + 1
    if (a.other) otherMap.set(a.other, (otherMap.get(a.other) ?? 0) + 1)
  }

  return {
    courses: courseOut,
    allergies: {
      keys: keyCounts as Record<string, number>,
      other: Array.from(otherMap.entries()).map(([text, count]) => ({ text, count })),
    },
  }
})
