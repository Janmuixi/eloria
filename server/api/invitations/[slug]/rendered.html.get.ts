import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { renderInvitation } from '~/server/utils/render-invitation'

const LOCALES_DIR = 'i18n/lang'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Slug required' })

  const evt = await db.query.events.findFirst({
    where: eq(events.slug, slug),
    with: { template: true },
  })

  if (!evt) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  if (evt.paymentStatus !== 'paid') {
    throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  }
  if (!evt.template) {
    throw createError({ statusCode: 500, statusMessage: 'Event has no template' })
  }

  const translations = loadTranslations(evt.language)

  const html = renderInvitation(
    {
      coupleName1: evt.coupleName1,
      coupleName2: evt.coupleName2,
      date: evt.date,
      venue: evt.venue,
      venueAddress: evt.venueAddress,
      venueMapUrl: evt.venueMapUrl,
      description: evt.description,
      customization: evt.customization,
      language: evt.language,
    },
    evt.template.htmlTemplate,
    translations,
  )

  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  return html
})

function loadTranslations(language: string): Record<string, unknown> {
  const preferred = join(LOCALES_DIR, `${language}.json`)
  const fallback = join(LOCALES_DIR, 'en.json')
  const path = existsSync(preferred) ? preferred : fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}
