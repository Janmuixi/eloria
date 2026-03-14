import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  return db.query.events.findMany({
    where: eq(events.userId, user.id),
    orderBy: desc(events.createdAt),
    with: { tier: true, template: true },
  })
})
