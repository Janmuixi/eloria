import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)

  const evt = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Event not found' })

  if (!body.csv?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'CSV data is required' })
  }

  const lines = body.csv
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)

  const values = lines.map((line: string) => {
    const parts = line.split(',').map((p: string) => p.trim())
    const name = parts[0]
    const email = parts[1] || null
    return {
      eventId: id,
      name,
      email,
      token: crypto.randomUUID(),
    }
  }).filter((v: { name: string }) => v.name.length > 0)

  if (values.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid entries found in CSV' })
  }

  await db.insert(guests).values(values)

  return { imported: values.length }
})
