import { db } from '../../db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { generateResetToken } from '~/server/utils/reset-token'
import { sendVerificationEmail } from '~/server/utils/email'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email } = body || {}

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required',
    })
  }

  const normalizedEmail = email.toLowerCase().trim()

  const user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'If your email is registered, you can request a password reset link',
    })
  }

  const { token, expiresAt } = generateResetToken({ email: normalizedEmail })

  await db
    .update(users)
    .set({
      resetToken: token,
      resetTokenExpiresAt: expiresAt.toISOString(),
    })
    .where(eq(users.id, user.id))

  const baseUrl = resolveEnvVar('BASE_URL', 'http://localhost:3000')

  await sendVerificationEmail({
    to: user.email,
    userName: user.name || 'User',
    verificationUrl: `${baseUrl}/reset-password?token=${token}`,
  })

  return {
    message: 'If your email is registered, you will receive a password reset link',
  }
})
