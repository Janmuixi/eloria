import { requireAuth } from '~/server/utils/auth'
import { sendInvitationEmail } from '~/server/utils/email'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and, isNull, isNotNull, inArray } from 'drizzle-orm'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'
import { formatDate, toEventDate } from '~/shared/date-format'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = parseInt(getRouterParam(event, 'id')!)

  const resendApiKey = resolveEnvVar('RESEND_API_KEY')
  if (!resendApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Email delivery is not configured. RESEND_API_KEY is missing.',
    })
  }

  const userEvent = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, user.id)),
    with: { tier: true },
  })

  if (!userEvent) {
    throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  }

  if (userEvent.paymentStatus !== 'paid') {
    throw createError({ statusCode: 403, statusMessage: 'Event must be paid to send invitations' })
  }

  if (!userEvent.tier?.hasEmailDelivery) {
    throw createError({ statusCode: 403, statusMessage: 'Email delivery is not available on your plan' })
  }

  const hasDesign = userEvent.templateId != null
    || (userEvent.invitationType === 'upload' && userEvent.customImagePath)
  if (!hasDesign) {
    throw createError({ statusCode: 400, statusMessage: 'Select a template or upload an image before sending invitations' })
  }

  const body = await readBody(event).catch(() => ({})) as { guestIds?: unknown }
  const explicitIds = Array.isArray(body?.guestIds)
    ? body.guestIds.filter((v): v is number => typeof v === 'number')
    : null

  const targetGuests = await db.query.guests.findMany({
    where: explicitIds && explicitIds.length > 0
      ? and(eq(guests.eventId, eventId), isNotNull(guests.email), inArray(guests.id, explicitIds))
      : and(eq(guests.eventId, eventId), isNotNull(guests.email), isNull(guests.emailSentAt)),
  })

  if (targetGuests.length === 0) {
    return { sent: 0, failed: 0, message: 'No invitations to send' }
  }

  const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')
  let sent = 0
  let failed = 0

  for (const guest of targetGuests) {
    if (!guest.email) continue

    try {
      const invitationUrl = `${baseUrl}/i/${userEvent.slug}?g=${guest.token}`

      await sendInvitationEmail({
        to: guest.email,
        guestName: guest.name,
        coupleName1: userEvent.coupleName1,
        coupleName2: userEvent.coupleName2,
        date: formatDate(toEventDate(userEvent.date), userEvent.language, 'long'),
        invitationUrl,
        rsvpUrl: invitationUrl,
      })

      await db
        .update(guests)
        .set({ emailSentAt: new Date().toISOString() })
        .where(eq(guests.id, guest.id))

      sent++
    } catch (e) {
      console.error(`Failed to send email to ${guest.email}:`, e)
      failed++
    }
  }

  return { sent, failed }
})
