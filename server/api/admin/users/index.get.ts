import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { users, events, subscriptions } from '~/server/db/schema'
import { count, sql, eq, desc, and, or, like, inArray } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const q = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0)
  const search = typeof q.q === 'string' ? q.q.trim().toLowerCase() : ''

  const where = search
    ? or(
        like(sql`lower(${users.email})`, `%${search}%`),
        like(sql`lower(${users.name})`, `%${search}%`),
      )
    : undefined

  const [totalRow] = await db
    .select({ n: count() })
    .from(users)
    .where(where)

  const baseRows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset)

  const ids = baseRows.map((r) => r.id)
  const eventCounts = ids.length
    ? await db
        .select({ userId: events.userId, n: count() })
        .from(events)
        .where(inArray(events.userId, ids))
        .groupBy(events.userId)
    : []
  const activeSubs = ids.length
    ? await db
        .select()
        .from(subscriptions)
        .where(and(inArray(subscriptions.userId, ids), eq(subscriptions.status, 'active')))
    : []

  const countByUser = new Map(eventCounts.map((c) => [c.userId, c.n]))
  const subByUser = new Map(activeSubs.map((s) => [s.userId, s]))

  const rows = baseRows.map((u) => {
    const sub = subByUser.get(u.id)
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerified,
      googleId: u.googleId,
      stripeCustomerId: u.stripeCustomerId,
      createdAt: u.createdAt,
      eventCount: countByUser.get(u.id) ?? 0,
      activeSubscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            price: sub.price,
            currentPeriodEnd: sub.currentPeriodEnd,
            canceledAt: sub.canceledAt,
          }
        : null,
    }
  })

  return { rows, total: totalRow.n, limit, offset }
})
