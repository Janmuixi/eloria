import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, menuCourses, menuOptions } from '~/server/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { validateMenuTree } from '~/server/utils/menu-validation'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)
  const tree = validateMenuTree(body)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
    columns: { id: true },
  })
  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  // Existing rows
  const existingCourses = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, id),
    with: { options: true },
  })

  const incomingCourseIds = new Set(tree.courses.map(c => c.id).filter((x): x is number => typeof x === 'number'))
  const coursesToDelete = existingCourses.filter(c => !incomingCourseIds.has(c.id))

  // Delete dropped courses (cascades options + choices via FK)
  if (coursesToDelete.length) {
    await db.delete(menuCourses).where(inArray(menuCourses.id, coursesToDelete.map(c => c.id))).run()
  }

  // Upsert each remaining course + its options
  for (let ci = 0; ci < tree.courses.length; ci++) {
    const c = tree.courses[ci]
    let courseId: number
    if (c.id && existingCourses.some(ec => ec.id === c.id)) {
      await db.update(menuCourses)
        .set({ name: c.name.trim(), sortOrder: ci })
        .where(eq(menuCourses.id, c.id))
        .run()
      courseId = c.id
    } else {
      const [created] = await db.insert(menuCourses)
        .values({ eventId: id, name: c.name.trim(), sortOrder: ci })
        .returning()
      courseId = created.id
    }

    // Diff options for this course
    const existingForCourse = existingCourses.find(ec => ec.id === courseId)?.options ?? []
    const incomingOptionIds = new Set(c.options.map(o => o.id).filter((x): x is number => typeof x === 'number'))
    const optionsToDelete = existingForCourse.filter(o => !incomingOptionIds.has(o.id))
    if (optionsToDelete.length) {
      await db.delete(menuOptions).where(inArray(menuOptions.id, optionsToDelete.map(o => o.id))).run()
    }
    for (let oi = 0; oi < c.options.length; oi++) {
      const o = c.options[oi]
      if (o.id && existingForCourse.some(eo => eo.id === o.id)) {
        await db.update(menuOptions)
          .set({ name: o.name.trim(), sortOrder: oi })
          .where(eq(menuOptions.id, o.id))
          .run()
      } else {
        await db.insert(menuOptions)
          .values({ courseId, name: o.name.trim(), sortOrder: oi })
          .run()
      }
    }
  }

  // Re-fetch and return canonical response (mirrors GET shape)
  const refreshed = await db.query.menuCourses.findMany({
    where: eq(menuCourses.eventId, id),
    with: { options: true },
  })
  refreshed.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  for (const c of refreshed) c.options.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

  return {
    courses: refreshed.map(c => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      options: c.options.map(o => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
    })),
  }
})
