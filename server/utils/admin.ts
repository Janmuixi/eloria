import type { H3Event } from 'h3'
import { requireAuth } from './auth'
import { resolveEnvVar } from './resolve-env-var'

function adminEmails(): string[] {
  const raw = resolveEnvVar('ADMIN_EMAILS', '')
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdmin(user: { email: string } | null | undefined): boolean {
  if (!user) return false
  return adminEmails().includes(user.email.toLowerCase())
}

export async function requireAdmin(event: H3Event) {
  const user = await requireAuth(event)
  if (!isAdmin(user)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}
