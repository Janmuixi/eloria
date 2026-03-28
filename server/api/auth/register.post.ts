import { db } from '../../db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../../utils/password'
import { createToken } from '../../utils/auth'
import { resolveEnvVar } from '~/server/utils/resolve-env-var'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const { email, password, name } = body || {}

  if (!email || !password || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email, password, and name are required',
    })
  }

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters',
    })
  }

  const normalizedEmail = email.toLowerCase().trim()

  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  })

  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Email already registered',
    })
  }

  const passwordHash = await hashPassword(password)

  const [user] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
    })
    .returning({ id: users.id, email: users.email, name: users.name })

  const token = createToken({ userId: user.id, email: user.email })

  setCookie(event, 'auth_token', token, {
    httpOnly: true,
    secure: resolveEnvVar('NODE_ENV') === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  // TODO: Send verification email after registration
  // The user can trigger this manually via POST /api/auth/send-verification
  // In production, consider calling send-verification logic here automatically

  return { user: { id: user.id, email: user.email, name: user.name } }
})
