import { Resend } from 'resend'

let resend: Resend | null = null

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }
  return resend
}

interface SendInvitationParams {
  to: string
  guestName: string
  coupleName1: string
  coupleName2: string
  date: string
  invitationUrl: string
}

export async function sendInvitationEmail(params: SendInvitationParams) {
  const client = getResend()

  return client.emails.send({
    from: 'Eloria <invitations@yourdomain.com>',
    to: params.to,
    subject: `You're invited to ${params.coupleName1} & ${params.coupleName2}'s wedding`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; text-align: center; padding: 40px 20px;">
        <h1 style="font-size: 24px; color: #333;">You're Invited!</h1>
        <p style="font-size: 16px; color: #666;">
          Dear ${params.guestName},<br><br>
          ${params.coupleName1} &amp; ${params.coupleName2} would love for you to celebrate their wedding on ${params.date}.
        </p>
        <a href="${params.invitationUrl}" style="display: inline-block; background: #df5676; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin-top: 20px; font-size: 16px;">
          View Invitation &amp; RSVP
        </a>
        <p style="font-size: 12px; color: #999; margin-top: 30px;">Sent via Eloria</p>
      </div>
    `,
  })
}
