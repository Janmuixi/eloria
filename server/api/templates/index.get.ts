import { db } from '~/server/db'
import { templates } from '~/server/db/schema'
import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const category = query.category as string | undefined

  return db.query.templates.findMany({
    where: category ? eq(templates.category, category) : undefined,
    orderBy: asc(templates.createdAt),
    with: { tier: true },
  })
})
