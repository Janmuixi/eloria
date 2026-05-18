import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { subscriptions, users } from '~/server/db/schema'
import { count, eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const q = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0)
  const status = typeof q.status === 'string' && q.status.trim() ? q.status.trim() : null

  const where = status ? eq(subscriptions.status, status) : undefined

  const [totalRow] = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(where)

  const baseRows = await db
    .select({
      id: subscriptions.id,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      stripeCustomerId: subscriptions.stripeCustomerId,
      status: subscriptions.status,
      price: subscriptions.price,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      canceledAt: subscriptions.canceledAt,
      createdAt: subscriptions.createdAt,
      userId: users.id,
      userEmail: users.email,
      userName: users.name,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(where)
    .orderBy(desc(subscriptions.createdAt))
    .limit(limit)
    .offset(offset)

  const rows = baseRows.map((r) => ({
    id: r.id,
    stripeSubscriptionId: r.stripeSubscriptionId,
    stripeCustomerId: r.stripeCustomerId,
    status: r.status,
    price: r.price,
    currentPeriodStart: r.currentPeriodStart,
    currentPeriodEnd: r.currentPeriodEnd,
    canceledAt: r.canceledAt,
    createdAt: r.createdAt,
    user: { id: r.userId, email: r.userEmail, name: r.userName },
  }))

  return { rows, total: totalRow.n, limit, offset }
})
