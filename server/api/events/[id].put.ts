import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { deleteImage } from '~/server/utils/image-storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)
  const body = await readBody(event)

  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  if (existing.paymentStatus === 'locked') {
    throw createError({ statusCode: 403, statusMessage: 'Event is locked. Reactivate your subscription to make changes.' })
  }

  const settingTemplate = body.templateId !== undefined && body.templateId !== null
  const willClearImage = settingTemplate && existing.customImagePath

  const update: Record<string, unknown> = {
    templateId: body.templateId ?? existing.templateId,
    customization: body.customization ?? existing.customization,
    tierId: body.tierId ?? existing.tierId,
    title: body.title ?? existing.title,
    coupleName1: body.coupleName1 ?? existing.coupleName1,
    coupleName2: body.coupleName2 ?? existing.coupleName2,
    date: body.date ?? existing.date,
    venue: body.venue ?? existing.venue,
    venueAddress: body.venueAddress ?? existing.venueAddress,
    venueMapUrl: body.venueMapUrl ?? existing.venueMapUrl,
    description: body.description ?? existing.description,
  }

  if (settingTemplate) {
    update.invitationType = 'template'
    update.customImagePath = null
  }

  const [updated] = await db.update(events)
    .set(update)
    .where(and(eq(events.id, id), eq(events.userId, user.id)))
    .returning()

  if (willClearImage && existing.customImagePath) {
    await deleteImage(existing.customImagePath).catch(() => {})
  }

  return updated
})
