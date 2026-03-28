import crypto from 'crypto'

interface GenerateResetTokenParams {
  email: string
}

export interface ResetTokenResult {
  token: string
  expiresAt: Date
}

export function generateResetToken(params: GenerateResetTokenParams): ResetTokenResult {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  return {
    token,
    expiresAt,
  }
}
