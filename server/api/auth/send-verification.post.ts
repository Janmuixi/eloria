import jwt from 'jsonwebtoken'
import { requireAuth } from '~/server/utils/auth'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  if (user.emailVerified) {
    return { message: 'Email already verified' }
  }

  const token = jwt.sign(
    { email: user.email, purpose: 'email-verification' },
    JWT_SECRET,
    { expiresIn: '24h' },
  )

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
  const verificationUrl = `${baseUrl}/auth/verify?token=${token}`

  // Send via Resend if configured, otherwise log to console for development
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    await resend.emails.send({
      from: 'Eloria <noreply@yourdomain.com>',
      to: user.email,
      subject: 'Verify your email - Eloria',
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; text-align: center; padding: 40px 20px;">
          <h1 style="font-size: 24px; color: #333;">Verify your email</h1>
          <p style="font-size: 16px; color: #666;">
            Hi ${user.name},<br><br>
            Please verify your email address by clicking the button below.
          </p>
          <a href="${verificationUrl}" style="display: inline-block; background: #df5676; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; margin-top: 20px; font-size: 16px;">
            Verify Email
          </a>
          <p style="font-size: 12px; color: #999; margin-top: 30px;">This link expires in 24 hours.</p>
        </div>
      `,
    })
  } else {
    console.log(`[DEV] Verification URL for ${user.email}: ${verificationUrl}`)
  }

  return { message: 'Verification email sent' }
})
