// server/api/auth/me/stats.get.ts
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const [{ value: eventCount }] = await db
    .select({ value: count() })
    .from(events)
    .where(eq(events.userId, user.id))

  return { eventCount }
})
