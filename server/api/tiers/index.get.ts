import { db } from '~/server/db'
import { tiers } from '~/server/db/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  return db.select().from(tiers).orderBy(asc(tiers.sortOrder))
})
