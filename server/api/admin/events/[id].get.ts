import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { events, users, tiers, templates, menuCourses, menuOptions } from '~/server/db/schema'
import { eq, asc, inArray } from 'drizzle-orm'
import { loadEventGuests } from '~/server/utils/event-guests'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = parseInt(getRouterParam(event, 'id')!, 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const evt = await db.query.events.findFirst({ where: eq(events.id, id) })
  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const owner = await db.query.users.findFirst({ where: eq(users.id, evt.userId) })
  const tier = evt.tierId
    ? await db.query.tiers.findFirst({ where: eq(tiers.id, evt.tierId) })
    : null
  const template = evt.templateId
    ? await db.query.templates.findFirst({ where: eq(templates.id, evt.templateId) })
    : null

  const courses = await db
    .select()
    .from(menuCourses)
    .where(eq(menuCourses.eventId, id))
    .orderBy(asc(menuCourses.sortOrder))
  const courseIds = courses.map((c) => c.id)
  const optionsAll = courseIds.length
    ? await db
        .select()
        .from(menuOptions)
        .where(inArray(menuOptions.courseId, courseIds))
        .orderBy(asc(menuOptions.sortOrder))
    : []

  const optsByCourse = new Map<number, typeof optionsAll>()
  for (const o of optionsAll) {
    if (!optsByCourse.has(o.courseId)) optsByCourse.set(o.courseId, [])
    optsByCourse.get(o.courseId)!.push(o)
  }

  const guests = await loadEventGuests(id)

  return {
    event: { ...evt, stripePaymentId: null, hasStripePayment: !!evt.stripePaymentId },
    owner: owner ? { id: owner.id, email: owner.email, name: owner.name } : null,
    tier: tier ?? null,
    template: template
      ? { id: template.id, slug: template.slug, name: template.name, category: template.category }
      : null,
    guests,
    menu: courses.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      options: (optsByCourse.get(c.id) ?? []).map((o) => ({ id: o.id, name: o.name, sortOrder: o.sortOrder })),
    })),
  }
})
