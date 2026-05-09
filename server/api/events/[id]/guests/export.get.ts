import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, menuCourses, menuOptions } from '~/server/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { loadEventGuests } from '~/server/utils/event-guests'
import { buildGuestsCsv, type CsvCourse } from '~/server/utils/guests-csv'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  const courses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, id),
    orderBy: [asc(menuCourses.sortOrder)],
  })
  const courseIds = courses.map(c => c.id)

  const [guests, options] = await Promise.all([
    loadEventGuests(id),
    courseIds.length === 0
      ? Promise.resolve([] as Array<{ id: number; courseId: number; name: string; sortOrder: number }>)
      : db.query.menuOptions.findMany({
          where: (o, { inArray }) => inArray(o.courseId, courseIds),
          orderBy: [asc(menuOptions.sortOrder)],
        }),
  ])

  const optionsByCourse = new Map<number, Array<{ id: number; name: string }>>()
  for (const o of options) {
    if (!optionsByCourse.has(o.courseId)) optionsByCourse.set(o.courseId, [])
    optionsByCourse.get(o.courseId)!.push({ id: o.id, name: o.name })
  }

  const csvCourses: CsvCourse[] = courses.map(c => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    options: optionsByCourse.get(c.id) ?? [],
  }))

  const body = buildGuestsCsv(guests, csvCourses)

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD in UTC
  const filename = `${evt.slug}-guests-${today}.csv`

  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  })

  return body
})
