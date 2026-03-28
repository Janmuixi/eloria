import { db } from '../../db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Reset token is required',
    })
  }

  const user = await db.query.users.findFirst({
    where: eq(users.resetToken, token as string),
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

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  }
})
