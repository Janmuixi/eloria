import jwt from 'jsonwebtoken'
import { db } from '~/server/db'
import { users } from '~/server/db/schema'
import { eq } from 'drizzle-orm'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

interface VerificationPayload {
  email: string
  purpose: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { token } = body || {}

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Token is required' })
  }

  let payload: VerificationPayload
  try {
    payload = jwt.verify(token, JWT_SECRET) as VerificationPayload
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired verification token' })
  }

  if (payload.purpose !== 'email-verification') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid token purpose' })
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, payload.email),
  })

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  if (user.emailVerified) {
    return { message: 'Email already verified' }
  }

  await db.update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, user.id))

  return { message: 'Email verified successfully' }
})
