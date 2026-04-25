import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { imageAbsolutePath } from '~/server/utils/image-storage'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Slug required' })

  const evt = await db.query.events.findFirst({ where: eq(events.slug, slug) })
  if (!evt || evt.paymentStatus !== 'paid') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  if (evt.invitationType !== 'upload' || !evt.customImagePath) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const fullPath = imageAbsolutePath(evt.customImagePath)
  try {
    await stat(fullPath)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Image missing' })
  }

  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return sendStream(event, createReadStream(fullPath))
})
