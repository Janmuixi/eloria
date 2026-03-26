import jwt from 'jsonwebtoken'
import { requireAuth } from '~/server/utils/auth'
import { sendVerificationEmail } from '~/server/utils/email'

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
    await sendVerificationEmail({
      to: user.email,
      userName: user.name,
      verificationUrl,
    })
  } else {
    console.log(`[DEV] Verification URL for ${user.email}: ${verificationUrl}`)
  }

  return { message: 'Verification email sent' }
})
