import puppeteer from 'puppeteer'
import { requireAuth } from '~/server/utils/auth'
import { db } from '~/server/db'
import { events } from '~/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = parseInt(getRouterParam(event, 'id')!)

  const userEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, user.id)),
    with: { tier: true },
  })

  if (!userEvent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  if (!userEvent.tier?.hasPdfExport) {
    throw createError({ statusCode: 403, statusMessage: 'PDF export not available on your plan' })
  }

  if (userEvent.paymentStatus !== 'paid') {
    throw createError({ statusCode: 403, statusMessage: 'Event must be paid to export PDF' })
  }

  const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()

    await page.goto(`${baseUrl}/i/${userEvent.slug}?print=true`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    })

    const pdf = await page.pdf({
      format: 'A5',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    setResponseHeaders(event, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${userEvent.slug}.pdf"`,
    })

    return pdf
  } finally {
    await browser.close()
  }
})
