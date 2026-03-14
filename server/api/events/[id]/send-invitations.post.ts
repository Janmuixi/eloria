import { requireAuth } from '~/server/utils/auth'
import { sendInvitationEmail } from '~/server/utils/email'
import { db } from '~/server/db'
import { events, guests } from '~/server/db/schema'
import { eq, and, isNull, isNotNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const eventId = parseInt(getRouterParam(event, 'id')!)

  if (!process.env.RESEND_API_KEY) {
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

  // Fetch guests with email addresses who haven't been sent an invitation yet
  const pendingGuests = await db.query.guests.findMany({
    where: and(
      eq(guests.eventId, eventId),
      isNotNull(guests.email),
      isNull(guests.emailSentAt),
    ),
  })

  if (pendingGuests.length === 0) {
    return { sent: 0, failed: 0, message: 'No pending invitations to send' }
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
  let sent = 0
  let failed = 0

  for (const guest of pendingGuests) {
    if (!guest.email) continue

    try {
      const invitationUrl = `${baseUrl}/i/${userEvent.slug}?g=${guest.token}`

      await sendInvitationEmail({
        to: guest.email,
        guestName: guest.name,
        coupleName1: userEvent.coupleName1,
        coupleName2: userEvent.coupleName2,
        date: new Date(userEvent.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        invitationUrl,
      })

      // Update emailSentAt for this guest
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
