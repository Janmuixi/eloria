import { db } from '~/server/db'
import { guests, menuCourses, guestMenuChoices, companions } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { validateAllergies, serializeAllergies } from '~/server/utils/menu-validation'

type CompanionInput = {
  position: number
  attending: boolean
  name: string | null
  menuChoices: Record<string, number> | undefined
  allergies: unknown
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Token required' })

  const body = await readBody(event)
  const { rsvpStatus, menuChoices, allergies, companions: companionInputs } = body

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

  // ── Validate companions array shape ──────────────────────────────
  if (!Array.isArray(companionInputs)) {
    throw createError({ statusCode: 400, statusMessage: 'companions array required' })
  }
  if (companionInputs.length !== guest.companionsAllowed) {
    throw createError({
      statusCode: 400,
      statusMessage: `expected ${guest.companionsAllowed} companion entries, got ${companionInputs.length}`,
    })
  }
  const seenPositions = new Set<number>()
  for (const c of companionInputs as CompanionInput[]) {
    if (!Number.isInteger(c.position) || c.position < 1 || c.position > guest.companionsAllowed) {
      throw createError({ statusCode: 400, statusMessage: `companion position out of range: ${c.position}` })
    }
    if (seenPositions.has(c.position)) {
      throw createError({ statusCode: 400, statusMessage: `duplicate companion position: ${c.position}` })
    }
    seenPositions.add(c.position)
  }

  // ── Load this event's menu (used for validation) ─────────────────
  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, guest.eventId),
    with: { options: true },
  })
  const hasMenu = courses.length > 0

  function validatePickMap(picks: unknown, label: string) {
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

  // ── Validate self picks/allergies ────────────────────────────────
  let selfPicks: Array<{ courseId: number; optionId: number }> = []
  let selfAllergies = null
  if (isConfirming && hasMenu) selfPicks = validatePickMap(menuChoices, 'menuChoices')
  if (isConfirming && allergiesEnabled) selfAllergies = validateAllergies(allergies)

  // ── Validate each companion ──────────────────────────────────────
  type ParsedCompanion = {
    position: number
    attending: boolean
    name: string | null
    picks: Array<{ courseId: number; optionId: number }>
    allergies: ReturnType<typeof validateAllergies>
  }
  const parsedCompanions: ParsedCompanion[] = []
  for (const c of companionInputs as CompanionInput[]) {
    const attending = isConfirming && c.attending === true
    let name: string | null = null
    let picks: Array<{ courseId: number; optionId: number }> = []
    let allergiesParsed = null
    if (attending) {
      const trimmed = (typeof c.name === 'string' ? c.name.trim() : '')
      if (!trimmed) {
        throw createError({ statusCode: 400, statusMessage: `companion ${c.position}: name required when attending` })
      }
      name = trimmed
      if (hasMenu) picks = validatePickMap(c.menuChoices, `companion ${c.position} menuChoices`)
      if (allergiesEnabled) allergiesParsed = validateAllergies(c.allergies)
    }
    parsedCompanions.push({ position: c.position, attending, name, picks, allergies: allergiesParsed })
  }

  // ── Persist atomically ───────────────────────────────────────────
  db.transaction((tx) => {
    const updateGuest: Record<string, unknown> = { rsvpStatus }
    if (allergiesEnabled) {
      updateGuest.allergies = isConfirming ? serializeAllergies(selfAllergies) : null
    }
    tx.update(guests).set(updateGuest).where(eq(guests.token, token)).run()

    // Replace this guest's menu-choice rows
    tx.delete(guestMenuChoices).where(eq(guestMenuChoices.guestId, guest.id)).run()

    // Upsert companion rows for every position; build a position→id map
    const positionToId = new Map<number, number>()
    for (const pc of parsedCompanions) {
      const existing = tx
        .select({ id: companions.id })
        .from(companions)
        .where(and(eq(companions.guestId, guest.id), eq(companions.position, pc.position)))
        .all()[0]

      if (existing) {
        tx.update(companions).set({
          name: pc.name,
          attending: pc.attending,
          allergies: allergiesEnabled ? serializeAllergies(pc.allergies) : null,
        }).where(eq(companions.id, existing.id)).run()
        positionToId.set(pc.position, existing.id)
      } else {
        const [row] = tx.insert(companions).values({
          guestId: guest.id,
          position: pc.position,
          name: pc.name,
          attending: pc.attending,
          allergies: allergiesEnabled ? serializeAllergies(pc.allergies) : null,
        }).returning().all()
        positionToId.set(pc.position, row.id)
      }
    }

    // Insert menu choices: self + each attending companion
    if (isConfirming && hasMenu) {
      const rows: Array<{ guestId: number; courseId: number; optionId: number; companionId: number | null }> = []
      for (const p of selfPicks) rows.push({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, companionId: null })
      for (const pc of parsedCompanions) {
        if (!pc.attending) continue
        const cid = positionToId.get(pc.position)!
        for (const p of pc.picks) rows.push({ guestId: guest.id, courseId: p.courseId, optionId: p.optionId, companionId: cid })
      }
      if (rows.length) tx.insert(guestMenuChoices).values(rows).run()
    }
  })

  return { success: true, rsvpStatus }
})
