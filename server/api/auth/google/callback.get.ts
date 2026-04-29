import { db } from '../../../db'
import { users } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { createToken } from '../../../utils/auth'
import { resolveEnvVar } from '../../../utils/resolve-env-var'

interface GoogleTokenResponse {
  access_token: string
  id_token: string
  expires_in: number
  token_type: string
}

interface GoogleUserInfo {
  sub: string
  email: string
  email_verified: boolean
  name: string
  picture?: string
  given_name?: string
}

export default defineEventHandler(async (event) => {
  const clientId = resolveEnvVar('GOOGLE_CLIENT_ID')
  const clientSecret = resolveEnvVar('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Google OAuth not configured' })
  }

  const baseUrl = resolveEnvVar('BASE_URL') || `${getRequestProtocol(event)}://${getRequestHost(event)}`
  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/auth/google/callback`

  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : ''
  const state = typeof query.state === 'string' ? query.state : ''
  const expectedState = getCookie(event, 'oauth_state')
  const next = getCookie(event, 'oauth_next') || '/dashboard'

  deleteCookie(event, 'oauth_state', { path: '/' })
  deleteCookie(event, 'oauth_next', { path: '/' })

  if (!code || !state || !expectedState || state !== expectedState) {
    return sendRedirect(event, '/auth/login?error=oauth_state', 302)
  }

  let tokens: GoogleTokenResponse
  try {
    tokens = await $fetch<GoogleTokenResponse>('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })
  } catch {
    return sendRedirect(event, '/auth/login?error=oauth_token', 302)
  }

  let userinfo: GoogleUserInfo
  try {
    userinfo = await $fetch<GoogleUserInfo>('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
  } catch {
    return sendRedirect(event, '/auth/login?error=oauth_userinfo', 302)
  }

  if (!userinfo.email || !userinfo.email_verified) {
    return sendRedirect(event, '/auth/login?error=oauth_email_unverified', 302)
  }

  const normalizedEmail = userinfo.email.toLowerCase().trim()

  let user = await db.query.users.findFirst({ where: eq(users.googleId, userinfo.sub) })

  if (!user) {
    const byEmail = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) })
    if (byEmail) {
      const [updated] = await db
        .update(users)
        .set({
          googleId: userinfo.sub,
          avatarUrl: userinfo.picture ?? byEmail.avatarUrl,
          emailVerified: true,
        })
        .where(eq(users.id, byEmail.id))
        .returning()
      user = updated
    } else {
      const [created] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          name: userinfo.name || userinfo.given_name || normalizedEmail.split('@')[0],
          googleId: userinfo.sub,
          avatarUrl: userinfo.picture,
          emailVerified: true,
        })
        .returning()
      user = created
    }
  }

  if (!user) {
    return sendRedirect(event, '/auth/login?error=oauth_user', 302)
  }

  const token = createToken({ userId: user.id, email: user.email })
  setCookie(event, 'auth_token', token, {
    httpOnly: true,
    secure: resolveEnvVar('NODE_ENV') === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return sendRedirect(event, next, 302)
})
