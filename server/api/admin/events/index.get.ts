import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { events, users, tiers, templates, guests } from '~/server/db/schema'
import { count, sql, eq, desc, and, or, like, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const q = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0)
  const search = typeof q.q === 'string' ? q.q.trim().toLowerCase() : ''
  const paymentStatus = typeof q.paymentStatus === 'string' && q.paymentStatus.trim()
    ? q.paymentStatus.trim()
    : null

  const filters = []
  if (paymentStatus) filters.push(eq(events.paymentStatus, paymentStatus))
  if (search) {
    filters.push(
      or(
        like(sql`lower(${events.title})`, `%${search}%`),
        like(sql`lower(${users.email})`, `%${search}%`),
      )!,
    )
  }
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters)

  const [totalRow] = await db
    .select({ n: count() })
    .from(events)
    .innerJoin(users, eq(users.id, events.userId))
    .where(where)

  const baseRows = await db
    .select({
      id: events.id,
      title: events.title,
      coupleName1: events.coupleName1,
      coupleName2: events.coupleName2,
      date: events.date,
      venue: events.venue,
      slug: events.slug,
      paymentStatus: events.paymentStatus,
      invitationType: events.invitationType,
      language: events.language,
      createdAt: events.createdAt,
      userId: events.userId,
      userEmail: users.email,
      userName: users.name,
      tierId: tiers.id,
      tierSlug: tiers.slug,
      tierName: tiers.name,
      templateId: templates.id,
      templateSlug: templates.slug,
      templateName: templates.name,
    })
    .from(events)
    .innerJoin(users, eq(users.id, events.userId))
    .leftJoin(tiers, eq(tiers.id, events.tierId))
    .leftJoin(templates, eq(templates.id, events.templateId))
    .where(where)
    .orderBy(desc(events.createdAt))
    .limit(limit)
    .offset(offset)

  const ids = baseRows.map((r) => r.id)
  const guestCounts = ids.length
    ? await db
        .select({ eventId: guests.eventId, n: count() })
        .from(guests)
        .where(inArray(guests.eventId, ids))
        .groupBy(guests.eventId)
    : []
  const countByEvent = new Map(guestCounts.map((c) => [c.eventId, c.n]))

  const rows = baseRows.map((r) => ({
    id: r.id,
    title: r.title,
    coupleName1: r.coupleName1,
    coupleName2: r.coupleName2,
    date: r.date,
    venue: r.venue,
    slug: r.slug,
    paymentStatus: r.paymentStatus,
    invitationType: r.invitationType,
    language: r.language,
    createdAt: r.createdAt,
    user: { id: r.userId, email: r.userEmail, name: r.userName },
    tier: r.tierId ? { id: r.tierId, slug: r.tierSlug!, name: r.tierName! } : null,
    template: r.templateId ? { id: r.templateId, slug: r.templateSlug!, name: r.templateName! } : null,
    guestCount: countByEvent.get(r.id) ?? 0,
  }))

  return { rows, total: totalRow.n, limit, offset }
})
