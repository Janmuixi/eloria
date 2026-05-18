import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { users, events, subscriptions } from '~/server/db/schema'
import { sql, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [usersRow] = await db.select({ n: sql<number>`count(*)` }).from(users)
  const [eventsRow] = await db.select({ n: sql<number>`count(*)` }).from(events)
  const [paidRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(events)
    .where(eq(events.paymentStatus, 'paid'))
  const [activeSubRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'))

  return {
    users: Number(usersRow.n),
    events: Number(eventsRow.n),
    paidEvents: Number(paidRow.n),
    activeSubscriptions: Number(activeSubRow.n),
  }
})
