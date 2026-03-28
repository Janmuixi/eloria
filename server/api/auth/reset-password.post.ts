import { db } from '../../db'
import { users } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import { hashPassword } from '~/server/utils/password'
import { createToken } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { token, newPassword } = body || {}

  if (!token || !newPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token and new password are required',
    })
  }

  if (newPassword.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters',
    })
  }

  const user = await db.query.users.findFirst({
    where: eq(users.resetToken, token),
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Invalid or expired reset link',
    })
  }

  if (!user.resetTokenExpiresAt) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Reset link has already been used',
    })
  }

  const resetTokenExpiresAt = new Date(user.resetTokenExpiresAt)

  if (resetTokenExpiresAt < new Date()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Reset link has expired',
    })
  }

  const passwordHash = await hashPassword(newPassword)

  await db
    .update(users)
    .set({
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id))

  const newAuthToken = createToken({ userId: user.id, email: user.email })

  return {
    token: newAuthToken,
  }
})
