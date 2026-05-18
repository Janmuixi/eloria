import { requireAdmin } from '~/server/utils/admin'
import { db } from '~/server/db'
import { tiers } from '~/server/db/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return db.select().from(tiers).orderBy(asc(tiers.sortOrder))
})
