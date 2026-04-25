import { eq, and } from 'drizzle-orm'
import { readMultipartFormData } from 'h3'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { saveImage, deleteImage } from '~/server/utils/image-storage'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const HEIC_TYPES = new Set(['image/heic', 'image/heif'])
const MAX_BYTES = 10 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = parseInt(getRouterParam(event, 'id')!)

  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, user.id)),
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  if (existing.paymentStatus === 'paid') {
    throw createError({ statusCode: 403, statusMessage: 'Cannot change design after payment' })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file field' })
  }
  const mime = (file.type || '').toLowerCase()
  if (HEIC_TYPES.has(mime)) {
    throw createError({ statusCode: 415, statusMessage: 'HEIC is not supported. Please save as JPEG.' })
  }
  if (!ALLOWED_TYPES.has(mime)) {
    throw createError({ statusCode: 415, statusMessage: 'Only JPEG, PNG, and WebP images are allowed.' })
  }
  if (file.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Image must be 10MB or smaller.' })
  }

  let saved
  try {
    saved = await saveImage(id, file.data)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'File is not a valid image.' })
  }

  if (existing.customImagePath) {
    await deleteImage(existing.customImagePath)
  }

  await db.update(events).set({
    invitationType: 'upload',
    customImagePath: saved.relativePath,
    templateId: null,
  }).where(eq(events.id, id))

  return {
    invitationType: 'upload' as const,
    customImagePath: saved.relativePath,
    width: saved.width,
    height: saved.height,
  }
})
