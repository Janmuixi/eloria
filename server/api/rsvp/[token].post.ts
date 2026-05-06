import { db } from '~/server/db'
import { guests, menuCourses, guestMenuChoices } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { validateAllergies, serializeAllergies } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const body = await readBody(event)
  const { rsvpStatus, plusOne, plusOneName, menuChoices, plusOneMenuChoices, allergies, plusOneAllergies } = body

  if (!['confirmed', 'declined'].includes(rsvpStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid RSVP status' })
  }

  const guest = await db.query.guests.findFirst({
    where: eq(guests.token, token),
    with: { event: true },
  })
  if (!guest) throw createError({ statusCode: 404, statusMessage: 'Guest not found' })

  const allergiesEnabled = guest.event?.allergiesEnabled === true

  const isConfirming = rsvpStatus === 'confirmed'
  const wantsPlusOne = isConfirming && !!plusOne

  // Load this event's menu (used for validation)
  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, guest.eventId),
    with: { options: true },
  })
  const hasMenu = courses.length > 0

  // Validate picks only when confirming AND a menu exists
  function validatePickMap(picks: unknown, label: 'menuChoices' | 'plusOneMenuChoices') {
    const out: Array<{ courseId: number; optionId: number }> = []
    if (!picks || typeof picks !== 'object') {
      throw createError({ statusCode: 400, statusMessage: `${label} required` })
    }
    for (const c of courses) {
      const raw = (picks as any)[c.id]
      const optionId = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(optionId)) {
        throw createError({ statusCode: 400, statusMessage: `${label}: missing pick for course ${c.name}` })
      }
      const option = c.options.find(o => o.id === optionId)
      if (!option) {
        throw createError({ statusCode: 400, statusMessage: `${label}: option ${optionId} does not belong to course ${c.name}` })
      }
      out.push({ courseId: c.id, optionId })
    }
    return out
  }

  let selfPicks: Array<{ courseId: number; optionId: number }> = []
  let p1Picks: Array<{ courseId: number; optionId: number }> = []
  let selfAllergies = null
  let p1AllergiesParsed = null

  if (isConfirming && hasMenu) {
    selfPicks = validatePickMap(menuChoices, 'menuChoices')
    if (wantsPlusOne) p1Picks = validatePickMap(plusOneMenuChoices, 'plusOneMenuChoices')
  }
  if (isConfirming && allergiesEnabled) {
    selfAllergies = validateAllergies(allergies)
    if (wantsPlusOne) p1AllergiesParsed = validateAllergies(plusOneAllergies)
  }

  // Persist guest row + choices atomically
  db.transaction((tx) => {
    const updateGuest: Record<string, unknown> = {
      rsvpStatus,
      plusOne: wantsPlusOne,
      plusOneName: wantsPlusOne ? plusOneName : null,
    }
    if (allergiesEnabled) {
      updateGuest.allergies = isConfirming ? serializeAllergies(selfAllergies) : null
      updateGuest.plusOneAllergies = wantsPlusOne ? serializeAllergies(p1AllergiesParsed) : null
    }
    tx.update(guests).set(updateGuest).where(eq(guests.token, token)).run()

    // Replace this guest's choice rows
    tx.delete(guestMenuChoices).where(eq(guestMenuChoices.guestId, guest.id)).run()
    if (isConfirming && hasMenu) {
      const rows = [
        ...selfPicks.map(p => ({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, forPlusOne: false })),
        ...(wantsPlusOne ? p1Picks.map(p => ({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, forPlusOne: true })) : []),
      ]
      if (rows.length) tx.insert(guestMenuChoices).values(rows).run()
    }
  })

  return { success: true, rsvpStatus }
})
