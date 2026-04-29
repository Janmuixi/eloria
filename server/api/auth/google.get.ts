import { randomBytes } from 'crypto'
import { resolveEnvVar } from '../../utils/resolve-env-var'

export default defineEventHandler((event) => {
  const clientId = resolveEnvVar('GOOGLE_CLIENT_ID')
  if (!clientId) {
    throw createError({ statusCode: 500, statusMessage: 'Google OAuth not configured' })
  }

  const baseUrl = resolveEnvVar('BASE_URL') || `${getRequestProtocol(event)}://${getRequestHost(event)}`
  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/auth/google/callback`

  const state = randomBytes(16).toString('hex')
  setCookie(event, 'oauth_state', state, {
    httpOnly: true,
    secure: resolveEnvVar('NODE_ENV') === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })

  const next = getQuery(event).next
  if (typeof next === 'string' && next.startsWith('/')) {
    setCookie(event, 'oauth_next', next, {
      httpOnly: true,
      secure: resolveEnvVar('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    })
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('access_type', 'online')
  authUrl.searchParams.set('prompt', 'select_account')

  return sendRedirect(event, authUrl.toString(), 302)
})
