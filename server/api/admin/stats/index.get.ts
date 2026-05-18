import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { users, events, subscriptions } from '~/server/db/schema'
import { count, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [usersRow] = await db.select({ n: count() }).from(users)
  const [eventsRow] = await db.select({ n: count() }).from(events)
  const [paidRow] = await db
    .select({ n: count() })
    .from(events)
    .where(eq(events.paymentStatus, 'paid'))
  const [activeSubRow] = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'))

  return {
    users: usersRow.n,
    events: eventsRow.n,
    paidEvents: paidRow.n,
    activeSubscriptions: activeSubRow.n,
  }
})
