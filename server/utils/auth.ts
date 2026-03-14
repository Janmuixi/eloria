import jwt from 'jsonwebtoken'
import type { H3Event } from 'h3'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TOKEN_EXPIRY = '7d'

interface JwtPayload {
  userId: number
  email: string
}

export function createToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export async function getAuthUser(event: H3Event) {
  const token = getCookie(event, 'auth_token')
  if (!token) return null

  try {
    const payload = verifyToken(token)
    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.userId),
    })
    return user || null
  } catch {
    return null
  }
}

export async function requireAuth(event: H3Event) {
  const user = await getAuthUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return user
}
